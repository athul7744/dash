"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";
import { format, startOfWeek } from "date-fns";

import { useNotePage } from "@/hooks/use-notes";
import { chooseHeroAction, type HeroActionKind } from "@/lib/dashboard/hero-action";
import { systemPageId } from "@/lib/notes/system-pages";
import type { Task } from "@/lib/powersync/AppSchema";
import { getCurrentUserId } from "@/lib/shared/auth";
import { timeOfDayForHour } from "@/lib/shared/greeting";
import { getDueDateInfo } from "@/lib/tasks/tasks";
import { localDateKey, recentNaiveWindow } from "@/lib/tracker/day-keys";

type TaskRow = Task & { id: string };

/**
 * Gathers the live signals (tasks, recent tracking, mood, journal) and returns
 * the hero's chosen next-best-action plus the most-relevant task. `now` is
 * snapshotted at mount so query args stay stable (no per-render re-subscribe).
 */
export function useHeroAction(): { kind: HeroActionKind; topTask: TaskRow | null } {
  const [now] = useState(() => new Date());

  // Pending top-level tasks, most-relevant first.
  const { data: pending = [] } = useQuery<TaskRow>(
    `SELECT * FROM tasks
     WHERE state = 'pending' AND parent_id IS NULL
     ORDER BY CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END,
              due_date ASC,
              CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC`,
  );

  // Any tracking in the last 2 hours (UTC-naive window matching the write format).
  const recentArgs = useMemo(() => recentNaiveWindow(now), [now]);
  const { data: recentLogs = [] } = useQuery<{ n: number }>(
    `SELECT COUNT(*) AS n FROM time_logs WHERE start_timestamp >= ? AND start_timestamp <= ?`,
    recentArgs,
  );

  const localKey = localDateKey(now);
  const { data: ratingRows = [] } = useQuery<{ id: string }>(
    `SELECT id FROM daily_ratings WHERE rating_date = ? LIMIT 1`,
    [localKey],
  );

  // This week's journal system page (exists once the user has started writing).
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getCurrentUserId()
      .then((id) => { if (active) setUserId(id); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const weekKey = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const journalPageId = userId ? systemPageId(userId, "journal", weekKey) : null;
  const { page: journalPage } = useNotePage(journalPageId);

  return useMemo(() => {
    let overdueCount = 0;
    let dueTodayCount = 0;
    for (const task of pending) {
      const label = getDueDateInfo(task.due_date ? new Date(task.due_date) : undefined).label;
      if (label === "Overdue") overdueCount += 1;
      else if (label === "Due Today") dueTodayCount += 1;
    }

    const kind = chooseHeroAction({
      timeOfDay: timeOfDayForHour(now.getHours()),
      pendingCount: pending.length,
      overdueCount,
      dueTodayCount,
      loggedRecently: (recentLogs[0]?.n ?? 0) > 0,
      moodRatedToday: ratingRows.length > 0,
      // Assume written until the user id resolves, so we never wrongly nudge the
      // journal on first paint.
      journalWrittenThisWeek: userId === null ? true : journalPage !== null,
    });

    return { kind, topTask: pending[0] ?? null };
  }, [now, pending, recentLogs, ratingRows, userId, journalPage]);
}
