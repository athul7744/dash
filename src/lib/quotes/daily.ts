import type { Quote } from "@/lib/quotes/quotes";
import { INDEX_SALT, POOL_SALT, dayNumber, hashInt } from "@/lib/shared/daily-pick";

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

export { dayNumber };

export function pickDailyQuote(quotes: Quote[], date: Date): Quote | null {
  if (quotes.length === 0) return null;

  const day = dayNumber(date);
  const favorites = quotes.filter((q) => q.favorite);

  const drawFavorites = favorites.length > 0 && hashInt(day ^ POOL_SALT) % 100 < FAVORITE_BIAS;
  const pool = drawFavorites ? favorites : quotes;

  const index = hashInt(day ^ INDEX_SALT) % pool.length;
  return pool[index];
}
