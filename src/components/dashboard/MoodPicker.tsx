"use client";

import { useQuery } from "@powersync/react";
import { motion, useReducedMotion } from "motion/react";

import { RATING_COLORS, RATING_LABELS } from "@/components/tracker/widgets/types";
import { useOptimisticValue } from "@/hooks/use-optimistic-value";
import { SPRING_SOFT } from "@/lib/shared/motion";
import { cn } from "@/lib/shared/utils";
import { localDateKey } from "@/lib/tracker/day-keys";
import { setDailyRating } from "@/lib/tracker/ratings";

const SCORES = [1, 2, 3, 4, 5];

/**
 * A day's mood as a row of 1–5 dots. Writes to `daily_ratings` (local date key)
 * via the shared upsert; optimistic until the watched query catches up. Shared
 * with the tracker, so setting it here reflects there and vice-versa. Defaults
 * to today; pass `dateKey`/`prompt` to rate another day (e.g. late-night
 * catch-up on yesterday).
 */
export function MoodPicker({
  className,
  dateKey,
  prompt = "How's today?",
}: {
  className?: string;
  dateKey?: string;
  prompt?: string;
}) {
  const localKey = dateKey ?? localDateKey(new Date());

  const { data: ratingRows = [] } = useQuery<{ id: string; score: number }>(
    `SELECT id, score FROM daily_ratings WHERE rating_date = ? LIMIT 1`,
    [localKey],
  );
  const persisted = ratingRows[0] ?? null;

  const [score, setScore] = useOptimisticValue<number | null>(persisted?.score ?? null);
  const reduce = useReducedMotion();

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
          <motion.button
            key={n}
            type="button"
            onClick={() => pick(n)}
            title={RATING_LABELS[n]}
            aria-label={RATING_LABELS[n]}
            aria-pressed={active}
            animate={{ scale: reduce ? 1 : active ? 1.1 : 1 }}
            whileHover={reduce ? undefined : { scale: active ? 1.1 : 1.05 }}
            whileTap={reduce ? undefined : { scale: 0.9 }}
            transition={reduce ? { duration: 0 } : SPRING_SOFT}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border transition-colors",
              active ? "border-transparent" : "border-border",
            )}
            style={active ? { backgroundColor: RATING_COLORS[n] } : undefined}
          >
            <span className="size-3 rounded-full" style={{ backgroundColor: active ? "#fff" : RATING_COLORS[n] }} />
          </motion.button>
        );
      })}
      <span className="ml-1 min-w-14 font-serif text-sm text-muted-foreground">
        {score ? RATING_LABELS[score] : prompt}
      </span>
    </div>
  );
}
