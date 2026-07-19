import { NextResponse } from "next/server";

import { parseMetadataHtml } from "@/lib/bookmarks/metadata";
import { createClient } from "@/lib/supabase/server";

/**
 * Best-effort page-metadata proxy: given `?url=`, fetch the page server-side and
 * return `{ title, description, image, host }` so the client can prefill a
 * bookmark's title. This is a server-side URL fetcher, so it is deliberately
 * locked down: auth-gated, http(s)-only, and refuses private/loopback hosts
 * (SSRF guard), with a timeout and a response-size cap.
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024; // 512 KB is plenty for <head> metadata.
const USER_AGENT =
  "Mozilla/5.0 (compatible; DashBookmarks/1.0; +https://dash.local)";

/** Reject hosts that could reach internal infrastructure (SSRF). */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  // IPv6 loopback / link-local / unique-local.
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  // IPv4 private / loopback / link-local ranges.
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export async function GET(request: Request) {
  // Auth-gate: only signed-in users may drive the proxy.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported scheme" }, { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 400 });
  }

  const host = target.hostname;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("html") || !res.body) {
      return NextResponse.json({ host });
    }

    // Read up to MAX_BYTES, then stop — metadata lives in <head>.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break; // got the head, no need for the body
    }
    void reader.cancel();

    return NextResponse.json({ ...parseMetadataHtml(html), host });
  } catch {
    return NextResponse.json({ host });
  } finally {
    clearTimeout(timeout);
  }
}
