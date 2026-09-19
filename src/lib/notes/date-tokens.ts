import { format, isValid, parseISO } from "date-fns";

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
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const ORDINAL_DAY = "\\d{1,2}(?:st|nd|rd|th)?";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_FIRST = new RegExp(`^${MONTH}\\s+${ORDINAL_DAY}(?:,?\\s*\\d{4})?$`, "i");
const DAY_FIRST = new RegExp(`^${ORDINAL_DAY}\\s+${MONTH}(?:,?\\s*\\d{4})?$`, "i");
const NUMERIC_DAY = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/;

export function parseDayQuery(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const relative = RELATIVE_WORDS[trimmed.toLowerCase()];
  if (relative) return getRelativeDate(relative);

  // ISO parsed as *local* midnight: `new Date("2026-09-15")` is UTC midnight,
  // which is the day before anywhere west of it.
  if (ISO_DAY.test(trimmed)) {
    const parsed = parseISO(trimmed);
    return isValid(parsed) ? parsed : null;
  }

  // Only the shapes a person writes a date in. `new Date` will take almost
  // anything: "summary" reads as March (it contains "mar"), "meeting notes 2026"
  // as January. Matching the whole string is what keeps ordinary words out.
  if (!MONTH_FIRST.test(trimmed) && !DAY_FIRST.test(trimmed) && !NUMERIC_DAY.test(trimmed)) return null;

  // Ordinals ("15th Sep") defeat `new Date`, and a missing year means this one.
  const plain = trimmed.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  const withYear = /\d{4}/.test(plain) ? plain : `${plain} ${new Date().getFullYear()}`;
  return parseDateToken(withYear);
}

/**
 * Only the canonical `{MMM d, yyyy}` a chip serializes to — the form
 * `formatDateToken` writes, and so the only one the editor ever produces.
 */
const DATE_TOKEN_IN_TEXT = /\{((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4})\}/g;

/**
 * Every date chip in a piece of text, as dates.
 *
 * Strict where `parseDateToken` is lenient, because this drives edge writes and
 * `new Date` reads almost anything as a date — `{summary}` alone would link
 * March. A missed link costs less than a wrong one.
 */
export function parseDateTokensInText(text: string): Date[] {
  const dates: Date[] = [];
  for (const match of text.matchAll(DATE_TOKEN_IN_TEXT)) {
    const parsed = parseDateToken(match[1]);
    if (parsed) dates.push(parsed);
  }
  return dates;
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
