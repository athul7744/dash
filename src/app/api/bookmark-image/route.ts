import { NextResponse } from "next/server";

import { isBlockedHost } from "@/lib/bookmarks/ssrf";
import { createClient } from "@/lib/supabase/server";

/**
 * Best-effort image proxy: given `?url=` (an og:image), fetch the image
 * server-side and stream the raw bytes back so the client can store it (browser
 * CORS blocks fetching most remote images directly). Same lockdown as the
 * metadata proxy: auth-gated, http(s)-only, SSRF-guarded, timed out, size-capped,
 * and it only returns responses that are actually images.
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — preview images, not large media.
const USER_AGENT = "Mozilla/5.0 (compatible; DashBookmarks/1.0; +https://dash.local)";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 415 });
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Too large" }, { status: 413 });
    }
    return new NextResponse(buffer, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
