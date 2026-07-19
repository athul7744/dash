import type { Quote } from "@/lib/quotes/quotes";

/**
 * Deterministic "quote of the day" pick, biased toward favorites.
 *
 * The choice is a pure function of the local calendar day, so it is stable for
 * the whole day and advances at local midnight. When any quotes are starred,
 * ~65% of days draw from the favorites; the rest (and all days when nothing is
 * starred) draw from the full set. Pool and index are both derived from a hash
 * of the day number — no `Math.random`, so it never shifts within a day.
 */

/** Share of days that draw from favorites (when any exist). */
const FAVORITE_BIAS = 65;

/** Integer day index for a date's LOCAL calendar day (tz-stable). */
export function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** Well-distributed 32-bit hash of an integer. */
function hashInt(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function pickDailyQuote(quotes: Quote[], date: Date): Quote | null {
  if (quotes.length === 0) return null;

  const day = dayNumber(date);
  const favorites = quotes.filter((q) => q.favorite);

  const drawFavorites = favorites.length > 0 && hashInt(day ^ 0x9e3779b9) % 100 < FAVORITE_BIAS;
  const pool = drawFavorites ? favorites : quotes;

  const index = hashInt(day ^ 0x85ebca6b) % pool.length;
  return pool[index];
}
