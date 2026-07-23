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

/** The serialized `{MMM d, yyyy}` token form (plain-text/markdown fallback). */
export function formatDateToken(date: Date): string {
  return `{${formatDateLabel(date)}}`;
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
