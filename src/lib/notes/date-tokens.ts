import { format } from "date-fns";

export type RelativeDateOffset = "today" | "tomorrow" | "yesterday" | "next-week" | "next-month" | "next-year";

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
