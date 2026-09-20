import { NextResponse } from "next/server";

import { parseMetadataHtml, type PageMetadata } from "@/lib/bookmarks/metadata";
import { isBlockedHost } from "@/lib/bookmarks/ssrf";
import { oembedEndpoint, parseOembed } from "@/lib/bookmarks/oembed";
import { createClient } from "@/lib/supabase/server";

/**
 * Best-effort page-metadata proxy: given `?url=`, fetch the page server-side and
 * return `{ title, description, image, host }` so the client can prefill a
 * bookmark's title. This is a server-side URL fetcher, so it is deliberately
 * locked down: auth-gated, http(s)-only, and refuses private/loopback hosts
 * (SSRF guard), with a timeout and a response-size cap.
 */

const FETCH_TIMEOUT_MS = 5000;
// The read stops at `</head>`, so this cap only binds on pages whose head is
// mostly script — and those are common enough to matter: YouTube puts its og
// tags 685 KB in, so at 512 KB a video link came back with nothing at all.
const MAX_BYTES = 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (compatible; DashBookmarks/1.0; +https://dash.local)";

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

    return NextResponse.json({ ...(await fillFromOembed(target.toString(), html, parseMetadataHtml(html))), host });
  } catch {
    // Even a page we couldn't read may have a known oEmbed provider.
    const fallback = await fillFromOembed(target.toString(), "", parseMetadataHtml(""));
    return NextResponse.json({ ...fallback, host });
  } finally {
    clearTimeout(timeout);
  }
}

type Metadata = { title: string; description: string; image: string };

/**
 * Fill what scraping missed from the page's oEmbed endpoint, if it has one.
 *
 * What counts as "missed" is the whole point. An `og:` tag is the page's answer
 * about itself and is always kept. A `<title>` element and a `name="description"`
 * are the *site's* — usually the same thing, but not on a page built in the
 * browser: YouTube's shell says " - YouTube" and describes YouTube, non-empty
 * and useless, which is why filling only empty fields left a video titled after
 * the site. So when the provider answers about this page, its title wins over a
 * site-level one, and a site-level description is dropped rather than shown —
 * oEmbed carries no description, and nothing is better than boilerplate.
 *
 * Skipped when the page already gave its own title and an image, so an ordinary
 * site costs no extra request.
 */
async function fillFromOembed(pageUrl: string, html: string, scraped: PageMetadata): Promise<Metadata> {
  if (scraped.titleFromOg && scraped.image) return scraped;

  const endpoint = oembedEndpoint(pageUrl, html);
  if (!endpoint) return scraped;

  // A discovered endpoint comes from the page, so it gets the same guard the
  // page did — otherwise a hostile page names an internal host and we fetch it.
  let target: URL;
  try {
    target = new URL(endpoint);
  } catch {
    return scraped;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return scraped;
  if (isBlockedHost(target.hostname)) return scraped;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return scraped;
    const embed = parseOembed(await res.json());
    const providerAnswered = Boolean(embed.title || embed.image);
    // Dropping a site-level description is only right for a page that said
    // nothing about *itself* — the shell signature. A page with an og:image but
    // no og:title reaches here too, and its `name="description"` is very likely
    // the real thing.
    const isShell = !scraped.titleFromOg && !scraped.image;
    const siteLevelOnly = providerAnswered && isShell && !scraped.descriptionFromOg;
    return {
      title: scraped.titleFromOg ? scraped.title : embed.title || scraped.title,
      description: siteLevelOnly ? "" : scraped.description,
      image: scraped.image || embed.image,
    };
  } catch {
    return scraped;
  } finally {
    clearTimeout(timeout);
  }
}
