"use client";

import { useQuery } from "@powersync/react";

import { RATING_COLORS, RATING_LABELS } from "@/components/tracker/widgets/types";
import { useOptimisticValue } from "@/hooks/use-optimistic-value";
import { cn } from "@/lib/shared/utils";
import { localDateKey } from "@/lib/tracker/day-keys";
import { setDailyRating } from "@/lib/tracker/ratings";

const SCORES = [1, 2, 3, 4, 5];

/**
 * Today's mood as a row of 1–5 dots. Writes to `daily_ratings` (local date key)
 * via the shared upsert; optimistic until the watched query catches up. Shared
 * with the tracker, so setting it here reflects there and vice-versa.
 */
export function MoodPicker({ className }: { className?: string }) {
  const localKey = localDateKey(new Date());

  const { data: ratingRows = [] } = useQuery<{ id: string; score: number }>(
    `SELECT id, score FROM daily_ratings WHERE rating_date = ? LIMIT 1`,
    [localKey],
  );
  const persisted = ratingRows[0] ?? null;

  const [score, setScore] = useOptimisticValue<number | null>(persisted?.score ?? null);

  const pick = (value: number) => {
    // Toggle-off only for an already-saved row (avoids an insert/delete race
    // against a not-yet-flushed optimistic pick).
    if (score === value && !persisted) return;
    const next = score === value ? null : value;
    setScore(next);
    void setDailyRating(localKey, value, persisted ? { id: persisted.id, score: persisted.score } : null);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {SCORES.map((n) => {
        const active = score === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            title={RATING_LABELS[n]}
            aria-label={RATING_LABELS[n]}
            aria-pressed={active}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border transition-all",
              active ? "scale-110 border-transparent" : "border-border hover:scale-105",
            )}
            style={active ? { backgroundColor: RATING_COLORS[n] } : undefined}
          >
            <span className="size-3 rounded-full" style={{ backgroundColor: active ? "#fff" : RATING_COLORS[n] }} />
          </button>
        );
      })}
      <span className="ml-1 min-w-14 font-serif text-sm text-muted-foreground">
        {score ? RATING_LABELS[score] : "How's today?"}
      </span>
    </div>
  );
}
