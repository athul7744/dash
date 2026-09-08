/**
 * Reading Logseq page properties.
 *
 * Values are rarely plain text — Logseq writes references, so a real vault holds
 * `Status:: #[[Yet To Read]]`, `Author:: [[Rea Savla]]`, `date:: [[Aug 26th, 2020]]`.
 * Everything here is about getting the value out of that wrapping without
 * splitting a list on a comma that lives inside it.
 */

/** Keys that map onto a field the notes app already has, rather than a custom property. */
export type BuiltinPropertyField =
  | "title"
  | "tags"
  | "emoji"
  | "favorite"
  | "created"
  | "updated"
  | "banner"
  | "bannerAlign";

const BUILTIN_BY_KEY: Record<string, BuiltinPropertyField> = {
  title: "title",
  tags: "tags",
  tag: "tags",
  icon: "emoji",
  emoji: "emoji",
  favorite: "favorite",
  favorited: "favorite",
  starred: "favorite",
  created: "created",
  "created-at": "created",
  updated: "updated",
  modified: "updated",
  "updated-at": "updated",
  banner: "banner",
  "banner-align": "bannerAlign",
};

/**
 * The field a key maps to, or null when it's custom.
 *
 * `date` is deliberately **not** here. It reads like a timestamp but in a real
 * vault it is data — a book's reading date, a lecture's date — so it belongs to
 * the mapping step as a custom property, not silently applied to `created_at`.
 */
export function builtinFieldFor(key: string): BuiltinPropertyField | null {
  return BUILTIN_BY_KEY[key.trim().toLowerCase()] ?? null;
}

/** Case/space-insensitive key identity, so `Tags` and `tags` are one key. */
export function propertyKeyId(key: string): string {
  return key.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Unwrap Logseq's reference syntax: `#[[Yet To Read]]`, `[[Page]]`, `#tag` → the label. */
export function cleanPropertyValue(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("#")) value = value.slice(1).trim();
  // Only unwrap when the whole value is one reference — `[[A]] and [[B]]` is
  // prose, and a greedy match would swallow the middle of it.
  const bracketed = /^\[\[([^\]]+)\]\]$/.exec(value);
  if (bracketed) value = bracketed[1];
  return value.trim();
}

/**
 * Split a property value into items, respecting `[[ ]]` — `date:: [[Feb 3rd, 2020]]`
 * is one value whose label contains a comma, not two values.
 */
export function splitPropertyList(raw: string): string[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.startsWith("[[", i)) {
      depth += 1;
      current += "[[";
      i += 1;
      continue;
    }
    if (raw.startsWith("]]", i) && depth > 0) {
      depth -= 1;
      current += "]]";
      i += 1;
      continue;
    }
    if (raw[i] === "," && depth === 0) {
      items.push(current);
      current = "";
      continue;
    }
    current += raw[i];
  }
  items.push(current);
  return items.map(cleanPropertyValue).filter((item) => item.length > 0);
}

/**
 * `banner-align:: 70%` → the vertical percent a banner is cropped at.
 *
 * Logseq writes a CSS `background-position` here, so a real vault holds
 * percentages, and its keywords mean what they do in CSS. Null when the value is
 * neither — a horizontal-only `left`, say, which this banner has no notion of.
 */
export function bannerAlignPercent(raw: string): number | null {
  const value = cleanPropertyValue(raw).toLowerCase();
  if (!value) return null;
  if (value === "top") return 0;
  if (value === "center" || value === "centre" || value === "middle") return 50;
  if (value === "bottom") return 100;

  const percent = /^(-?\d+(?:\.\d+)?)\s*%?$/.exec(value);
  if (!percent) return null;
  return Math.min(100, Math.max(0, Math.round(Number.parseFloat(percent[1]))));
}

/**
 * Logseq journal-style dates → an ISO day. Its default format carries an ordinal
 * suffix (`Aug 26th, 2020`) that `Date.parse` rejects, so those come off first.
 * Null when the value isn't a date at all.
 */
export function parseLogseqDate(raw: string): string | null {
  const value = cleanPropertyValue(raw);
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // `Date.parse` is far too willing — it reads "70%" as the year 1970. Require a
  // four-digit year plus either a month name or a date separator before trusting it.
  if (!/\b\d{4}\b/.test(value)) return null;
  if (!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value) && !/[-/.]/.test(value)) return null;

  const parsed = Date.parse(value.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1"));
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
