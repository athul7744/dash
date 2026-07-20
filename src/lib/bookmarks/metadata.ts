/**
 * Best-effort page metadata scraped from raw HTML. Pure + regex-based (no DOM
 * dependency) so it stays cheap and unit-testable. Every field is optional —
 * callers always fall back to the URL host.
 */
export interface PageMetadata {
  title: string;
  description: string;
  image: string;
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
  return {
    title: metaContent(safe, "og:title") || decodeEntities(titleTag),
    description: metaContent(safe, "og:description") || metaContent(safe, "description"),
    image: metaContent(safe, "og:image"),
  };
}
