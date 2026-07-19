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

/** Decode the small set of HTML entities that commonly appear in titles. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
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
