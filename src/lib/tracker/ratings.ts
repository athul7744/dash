import { v4 as uuidv4 } from "uuid";

import { getCurrentUserId } from "@/lib/shared/auth";
import { cancelExecute, cancelUpdate, debouncedExecute, debouncedUpdate } from "@/lib/shared/debounced-update";

export interface ExistingRating {
  id: string;
  score: number | null;
}

/**
 * Upsert (or clear) a day's mood rating in `daily_ratings`. Mirrors the
 * tracker page's handler: clicking the currently-selected score again clears
 * it. Writes are debounced/keyed so rapid taps coalesce.
 *
 * Note: `daily_ratings.rating_date` is keyed by the LOCAL calendar date
 * (`format(new Date(), "yyyy-MM-dd")`), unlike `time_logs` which is UTC-naive.
 *
 * @returns the resulting score (`null` when cleared) for optimistic UI.
 */
export async function setDailyRating(
  dateStr: string,
  score: number,
  existing?: ExistingRating | null,
): Promise<number | null> {
  const currentScore = existing?.score ?? null;
  const nextScore = currentScore === score ? null : score;
  const existingId = existing?.id;

  // No row yet → insert (or no-op if toggling an already-empty day).
  if (!existingId) {
    const entityKey = `daily-rating:${dateStr}`;
    cancelExecute(entityKey);
    if (nextScore === null) return null;

    const userId = await getCurrentUserId();
    debouncedExecute(
      `INSERT INTO daily_ratings (id, user_id, rating_date, score, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [uuidv4(), userId, dateStr, nextScore],
      entityKey,
    );
    return nextScore;
  }

  // Existing row → update score, or delete when cleared.
  const entityKey = `daily-rating:${existingId}`;
  cancelExecute(entityKey);

  if (nextScore === null) {
    cancelUpdate(existingId, "score", "daily_ratings");
    debouncedExecute("DELETE FROM daily_ratings WHERE id = ?", [existingId], entityKey);
    return null;
  }

  debouncedUpdate(existingId, "score", nextScore, "daily_ratings");
  return nextScore;
}
