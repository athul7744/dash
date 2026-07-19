/**
 * Shared primitives for deterministic "of the day" picks (quotes, bookmarks…).
 *
 * A pick is a pure function of the local calendar day, so it is stable for the
 * whole day and advances at local midnight — no `Math.random`, so it never
 * shifts within a day. Use two independent salts (pool-selection then index)
 * against `hashInt(dayNumber(date) ^ salt)`.
 */

/** Integer day index for a date's LOCAL calendar day (tz-stable). */
export function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** Well-distributed 32-bit hash of an integer. */
export function hashInt(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Salt for choosing which pool (favorites/unread vs the full set) a day draws from. */
export const POOL_SALT = 0x9e3779b9;
/** Salt for choosing the index within the chosen pool. */
export const INDEX_SALT = 0x85ebca6b;
