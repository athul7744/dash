/**
 * oEmbed: the supported way to ask a site about one of its pages.
 *
 * Scraping `<head>` covers most of the web, but not the parts of it that build
 * their pages in the browser. YouTube is the case that forced this — it serves a
 * fetcher a shell with no og tags and an empty `<title>`, whatever
 * User-Agent it is asked with, because the real page is rendered by script. Its
 * oEmbed endpoint answers instantly with the title and thumbnail.
 *
 * Two ways to find an endpoint, in order of preference:
 *
 *  1. **The page says so.** oEmbed providers are supposed to advertise
 *     themselves with `<link type="application/json+oembed">`, and honouring
 *     that works for every site that does, with no list to maintain.
 *  2. **We know the provider.** For a site that serves us a shell without even
 *     that link, the endpoint has to be known up front.
 *
 * Anything discovered from a page is attacker-controlled, so the caller must put
 * the resulting URL through the same SSRF guard as the page itself.
 */

/** Endpoints for providers that don't advertise oEmbed in the HTML we receive. */
const KNOWN_PROVIDERS: { host: (host: string) => boolean; endpoint: string }[] = [
  {
    host: (host) => host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com"),
    endpoint: "https://www.youtube.com/oembed",
  },
];

/** `<link rel="alternate" type="application/json+oembed" href="…">`, either attribute order. */
const DISCOVERY = [
  /<link[^>]+type=["']application\/json\+oembed["'][^>]*href=["']([^"']+)["']/i,
  /<link[^>]+href=["']([^"']+)["'][^>]*type=["']application\/json\+oembed["']/i,
];

/**
 * The oEmbed endpoint to ask about `pageUrl`, or null if there is none.
 *
 * `html` is optional so a caller with no page in hand (one whose fetch failed
 * outright) can still reach a known provider.
 */
export function oembedEndpoint(pageUrl: string, html = ""): string | null {
  for (const pattern of DISCOVERY) {
    const href = html.match(pattern)?.[1];
    // A discovered endpoint already names the page it is about.
    if (href) return href.replace(/&amp;/g, "&");
  }

  let host: string;
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  const provider = KNOWN_PROVIDERS.find((candidate) => candidate.host(host));
  return provider ? `${provider.endpoint}?format=json&url=${encodeURIComponent(pageUrl)}` : null;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * The parts of an oEmbed response a card can use.
 *
 * oEmbed has no description field, so that stays empty rather than being filled
 * with the author's name — a channel is not a summary of a video.
 */
export function parseOembed(raw: unknown): { title: string; image: string } {
  if (!raw || typeof raw !== "object") return { title: "", image: "" };
  const body = raw as Record<string, unknown>;
  return { title: str(body.title), image: str(body.thumbnail_url) };
}
