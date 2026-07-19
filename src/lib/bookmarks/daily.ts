import type { Bookmark } from "@/lib/bookmarks/bookmarks";
import { INDEX_SALT, POOL_SALT, dayNumber, hashInt } from "@/lib/shared/daily-pick";

/**
 * Deterministic "bookmark to revisit" pick, biased toward unread.
 *
 * The choice is a pure function of the local calendar day, so it is stable for
 * the whole day and advances at local midnight. When any bookmarks are unread,
 * ~65% of days draw from the unread set (nudging you to actually read what you
 * saved); the rest (and all days when nothing is unread) draw from the full
 * set. No `Math.random`, so it never shifts within a day.
 */

/** Share of days that draw from the unread set (when any exist). */
const UNREAD_BIAS = 65;

export function pickDailyBookmark(bookmarks: Bookmark[], date: Date): Bookmark | null {
  if (bookmarks.length === 0) return null;

  const day = dayNumber(date);
  const unread = bookmarks.filter((b) => b.unread);

  const drawUnread = unread.length > 0 && hashInt(day ^ POOL_SALT) % 100 < UNREAD_BIAS;
  const pool = drawUnread ? unread : bookmarks;

  const index = hashInt(day ^ INDEX_SALT) % pool.length;
  return pool[index];
}
