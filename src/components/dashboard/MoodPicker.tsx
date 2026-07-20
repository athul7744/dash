"use client";

import { useQuery } from "@powersync/react";
import { motion, useReducedMotion } from "motion/react";

import { useMoods } from "@/hooks/use-moods";
import { useOptimisticValue } from "@/hooks/use-optimistic-value";
import { SPRING_SOFT } from "@/lib/shared/motion";
import { cn } from "@/lib/shared/utils";
import { localDateKey } from "@/lib/tracker/day-keys";
import { moodByValue, moodHex } from "@/lib/tracker/moods";
import { setDailyRating } from "@/lib/tracker/ratings";

/**
 * A day's mood as a row of dots — one per configured mood (worst→best). Writes
 * to `daily_ratings` (local date key) via the shared upsert; optimistic until
 * the watched query catches up. Shared with the tracker, so setting it here
 * reflects there and vice-versa. Defaults to today; pass `dateKey`/`prompt` to
 * rate another day (e.g. late-night catch-up on yesterday).
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
  const moods = useMoods();

  const { data: ratingRows = [] } = useQuery<{ id: string; score: number }>(
    `SELECT id, score FROM daily_ratings WHERE rating_date = ? LIMIT 1`,
    [localKey],
  );
  const persisted = ratingRows[0] ?? null;

  const [score, setScore] = useOptimisticValue<number | null>(persisted?.score ?? null);
  const reduce = useReducedMotion();
  const activeMood = moodByValue(moods, score);

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
      {moods.map((mood) => {
        const active = score === mood.value;
        const hex = moodHex(mood);
        return (
          <motion.button
            key={mood.id}
            type="button"
            onClick={() => pick(mood.value)}
            title={mood.label}
            aria-label={mood.label}
            aria-pressed={active}
            animate={{ scale: reduce ? 1 : active ? 1.1 : 1 }}
            whileHover={reduce ? undefined : { scale: active ? 1.1 : 1.05 }}
            whileTap={reduce ? undefined : { scale: 0.9 }}
            transition={reduce ? { duration: 0 } : SPRING_SOFT}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border transition-colors",
              active ? "border-transparent" : "border-border",
            )}
            style={active ? { backgroundColor: hex } : undefined}
          >
            <span className="size-3 rounded-full" style={{ backgroundColor: active ? "#fff" : hex }} />
          </motion.button>
        );
      })}
      <span className="ml-1 min-w-14 font-serif text-sm text-muted-foreground">
        {activeMood ? activeMood.label : prompt}
      </span>
    </div>
  );
}
