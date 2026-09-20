/**
 * Best-effort page metadata scraped from raw HTML. Pure + regex-based (no DOM
 * dependency) so it stays cheap and unit-testable. Every field is optional —
 * callers always fall back to the URL host.
 */
export interface PageMetadata {
  title: string;
  description: string;
  image: string;
  /**
   * Whether each value is the page's own answer about *itself* (an `og:` tag) or
   * a site-level fallback — the `<title>` element, or `name="description"`.
   *
   * The difference matters for a page rendered in the browser, which serves a
   * fetcher a shell: YouTube's `<title>` is " - YouTube" and its description is
   * boilerplate about YouTube, both of them about the site rather than the
   * video. Non-empty, so a caller that only checks for emptiness keeps them.
   */
  titleFromOg: boolean;
  descriptionFromOg: boolean;
}

/** Common named HTML entities that appear in titles/descriptions. */
const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
};

/** A numeric character reference → its character, or the original text if invalid. */
function fromCodePoint(raw: string, code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return raw;
  try {
    return String.fromCodePoint(code);
  } catch {
    return raw;
  }
}

/**
 * Decode HTML entities commonly found in scraped titles/descriptions: any
 * numeric reference (decimal `&#064;` or hex `&#x40;`) plus a small named set.
 * `&amp;` is decoded last so a doubly-encoded `&amp;#064;` stays literal.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (m, d: string) => fromCodePoint(m, parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h: string) => fromCodePoint(m, parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&amp;/gi, "&")
    .trim();
}

/** Read the `content` attribute of the first `<meta>` matching `property="<prop>"` (or `name=`). */
function metaContent(html: string, prop: string): string {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match either attribute order: content before or after the property/name key.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return "";
}

export function parseMetadataHtml(html: string): PageMetadata {
  const safe = html ?? "";
  const titleTag = safe.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const ogTitle = metaContent(safe, "og:title");
  const ogDescription = metaContent(safe, "og:description");
  return {
    title: ogTitle || decodeEntities(titleTag),
    description: ogDescription || metaContent(safe, "description"),
    image: metaContent(safe, "og:image"),
    titleFromOg: Boolean(ogTitle),
    descriptionFromOg: Boolean(ogDescription),
  };
}
