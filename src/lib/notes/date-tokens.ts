import { format, isValid } from "date-fns";

export type RelativeDateOffset = "today" | "tomorrow" | "yesterday" | "next-week" | "next-month" | "next-year";

/**
 * Parse the inside of a `{…}` token into a Date, or null if it isn't a date.
 * The one parser shared by the date-token input rule and the legacy-text
 * decoration, so both agree on what counts as a date (the `< 6` guard keeps
 * short strings like `{2026}` from becoming chips).
 */
export function parseDateToken(raw: string): Date | null {
  if (raw.trim().length < 6) return null;
  const parsed = new Date(raw);
  return isValid(parsed) ? parsed : null;
}

/** The inline atomic node a date renders as in the editor (see DateTokenNode). */
export const DATE_TOKEN_NODE_TYPE = "dateToken";

/** The human date a token displays, e.g. "Jul 23, 2026" — the node's `date` attr. */
export function formatDateLabel(date: Date): string {
  return format(date, "MMM d, yyyy");
}

/** Wrap a display date label in its `{…}` token form — the one place `{…}` is built. */
export function dateLabelToToken(label: string): string {
  return `{${label}}`;
}

/** The serialized `{MMM d, yyyy}` token form (plain-text/markdown fallback). */
export function formatDateToken(date: Date): string {
  return dateLabelToToken(formatDateLabel(date));
}

const RELATIVE_WORDS: Record<string, RelativeDateOffset> = {
  today: "today",
  tomorrow: "tomorrow",
  yesterday: "yesterday",
};

/**
 * Read a typed query as a day: "sep 15", "2026-09-15", "yesterday".
 *
 * Shared by the `[[` picker and the command palette so both agree on what counts
 * as a date. Two rules `parseDateToken` alone gets wrong for a *query*:
 *
 * - No year means this year. `new Date("sep 15")` lands in 2001.
 * - A bare number is not a date. "12" would parse as December, which makes
 *   searching for "12" offer a day nobody asked for.
 */
export function parseDayQuery(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const relative = RELATIVE_WORDS[trimmed.toLowerCase()];
  if (relative) return getRelativeDate(relative);

  // `new Date` is far too willing: it reads "meeting notes 2026" as January,
  // and "12" as December. Require the shape of a date first — a month name,
  // or digits around a separator.
  const looksLikeDate =
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(trimmed) || /\d[/-]\d/.test(trimmed);
  if (!looksLikeDate) return null;

  const withYear = /\d{4}/.test(trimmed) ? trimmed : `${trimmed} ${new Date().getFullYear()}`;
  return parseDateToken(withYear);
}

export function getRelativeDate(offset: RelativeDateOffset): Date {
  const d = new Date();
  switch (offset) {
    case "today": return d;
    case "tomorrow": d.setDate(d.getDate() + 1); return d;
    case "yesterday": d.setDate(d.getDate() - 1); return d;
    case "next-week": d.setDate(d.getDate() + 7); return d;
    case "next-month": d.setMonth(d.getMonth() + 1); return d;
    case "next-year": d.setFullYear(d.getFullYear() + 1); return d;
  }
}
