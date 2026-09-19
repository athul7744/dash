"use client";

/**
 * The tracker grid's data and writes, for any set of days.
 *
 * The week workspace and the Day surface paint the same cells, so the reading,
 * the optimistic layer and the two writers live here rather than in either
 * screen. What stays with the caller is the brush: this exposes `setCell`, an
 * intent ("this hour becomes that activity, or nothing"), and each surface maps
 * its own toolbar onto it.
 *
 * **The day convention is the tracker's own.** A cell's timestamp is UTC-naive —
 * local wall-clock parts stamped into a UTC instant — so a day is keyed by the
 * UTC date of that instant, while `daily_ratings.rating_date` is the local date.
 * Both derivations live in `lib/tracker/day-keys.ts`; nothing here should grow
 * its own (see the UTC-naive migration note in the docs).
 *
 * Writes are optimistic: a painted cell shows immediately, the debounced write
 * follows, and the optimistic entry is dropped once the persisted row matches.
 * That reconciliation happens at render time, guarded on the source data's
 * identity, so it costs no extra render pass.
 */

import { useQuery } from "@powersync/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { useMoods } from "@/hooks/use-moods";
import type { GridCell, GridData } from "@/components/tracker/TimeGrid";
import type { ActivityType, DailyRating, TimeLog } from "@/lib/powersync/AppSchema";
import { getCurrentUserId } from "@/lib/shared/auth";
import {
  cancelExecute,
  cancelUpdate,
  debouncedExecute,
  debouncedUpdate,
} from "@/lib/shared/debounced-update";
import { DEFAULT_ACTIVITY_CATEGORY, type ActivityCategory } from "@/lib/tracker/activities";
import { hourCellKey, localDateKey, utcDateKey, utcDayBounds } from "@/lib/tracker/day-keys";
import type { Mood } from "@/lib/tracker/moods";

export interface OptimisticTimeLogChange {
  rowId: string;
  activityName: string | null;
}

export interface OptimisticRatingChange {
  rowId: string;
  score: number | null;
}

export interface TimeGridModel {
  /** Painted cells for `days`, optimistic edits folded in. */
  data: GridData;
  /** Local date key → mood score, optimistic edits folded in. */
  ratings: Map<string, number>;
  activityTypes: (ActivityType & { id: string })[];
  colorMap: Record<string, string>;
  categoryMap: Record<string, ActivityCategory>;
  moods: Mood[];
  isLoading: boolean;
  /**
   * Unsaved edits within `days`, so a surface showing the same data another way
   * (the year grids) reflects a cell the moment it is painted.
   */
  optimisticTimeLogs: Map<string, OptimisticTimeLogChange>;
  optimisticRatings: Map<string, OptimisticRatingChange>;
  /** Paint one hour, or clear it with `null`. No-ops when nothing would change. */
  setCell: (day: Date, hour: number, existing: GridCell | undefined, activity: string | null) => Promise<void>;
  /** Set the day's mood, or clear it by picking the one already set. */
  setRating: (dateKey: string, score: number) => Promise<void>;
}

export function useTimeGrid(days: Date[]): TimeGridModel {
  const [optimisticTimeLogs, setOptimisticTimeLogs] = useState<Map<string, OptimisticTimeLogChange>>(new Map());
  const [optimisticRatings, setOptimisticRatings] = useState<Map<string, OptimisticRatingChange>>(new Map());
  const optimisticTimeLogsRef = useRef(optimisticTimeLogs);
  const optimisticRatingsRef = useRef(optimisticRatings);

  useEffect(() => {
    optimisticTimeLogsRef.current = optimisticTimeLogs;
  }, [optimisticTimeLogs]);

  useEffect(() => {
    optimisticRatingsRef.current = optimisticRatings;
  }, [optimisticRatings]);

  const { data: activityTypes, isLoading: loadingActivities } = useQuery<ActivityType & { id: string }>(
    "SELECT * FROM activity_types ORDER BY created_at ASC",
  );
  const moods = useMoods();

  const colorMap = useMemo(
    () => Object.fromEntries(activityTypes.map((activity) => [activity.name, activity.color ?? "teal"])),
    [activityTypes],
  );

  const categoryMap = useMemo<Record<string, ActivityCategory>>(
    () =>
      Object.fromEntries(
        activityTypes.map((activity) => [
          activity.name,
          (activity.category as ActivityCategory) ?? DEFAULT_ACTIVITY_CATEGORY,
        ]),
      ),
    [activityTypes],
  );

  // The window covers whole days, so one bound pair spans the whole set.
  const [rangeStart] = utcDayBounds(localDateKey(days[0]));
  const [, rangeEnd] = utcDayBounds(localDateKey(days[days.length - 1]));
  const dayKeys = useMemo(() => new Set(days.map((day) => localDateKey(day))), [days]);

  const { data: logs, isLoading: loadingLogs } = useQuery<TimeLog & { id: string }>(
    `SELECT id, activity_name, start_timestamp, duration_minutes
     FROM time_logs
     WHERE start_timestamp >= ? AND start_timestamp <= ?
     ORDER BY start_timestamp ASC`,
    [rangeStart, rangeEnd],
  );

  const gridData: GridData = useMemo(() => {
    const map: GridData = new Map();
    for (const log of logs) {
      const timestamp = new Date(log.start_timestamp!);
      map.set(hourCellKey(utcDateKey(timestamp), timestamp.getUTCHours()), {
        id: log.id,
        activityName: log.activity_name ?? undefined,
      });
    }
    return map;
  }, [logs]);

  const mergedGridData: GridData = useMemo(() => {
    const map: GridData = new Map(gridData);

    optimisticTimeLogs.forEach((change, cellKey) => {
      const [dateKey] = cellKey.split("|");
      if (!dayKeys.has(dateKey)) return;

      if (change.activityName === null) {
        map.delete(cellKey);
        return;
      }

      map.set(cellKey, { id: change.rowId, activityName: change.activityName });
    });

    return map;
  }, [dayKeys, gridData, optimisticTimeLogs]);

  const { data: ratingRows } = useQuery<DailyRating & { id: string }>(
    "SELECT * FROM daily_ratings WHERE rating_date >= ? AND rating_date <= ?",
    [localDateKey(days[0]), localDateKey(days[days.length - 1])],
  );

  const ratingsMap = useMemo(
    () =>
      new Map(
        ratingRows.filter((row) => row.rating_date).map((row) => [row.rating_date as string, row.score as number]),
      ),
    [ratingRows],
  );

  const ratingsIdMap = useMemo(
    () => new Map(ratingRows.filter((row) => row.rating_date).map((row) => [row.rating_date as string, row.id])),
    [ratingRows],
  );

  const mergedRatingsMap = useMemo(() => {
    const map = new Map(ratingsMap);

    optimisticRatings.forEach((change, dateKey) => {
      if (!dayKeys.has(dateKey)) return;

      if (change.score === null) {
        map.delete(dateKey);
        return;
      }

      map.set(dateKey, change.score);
    });

    return map;
  }, [dayKeys, optimisticRatings, ratingsMap]);

  // Drop optimistic entries once the persisted data catches up. Render-time
  // reconciliation guarded on the source data's identity, rather than an effect,
  // so there's no extra cascading-render pass.
  const [logReconcileKey, setLogReconcileKey] = useState<{ keys: typeof dayKeys; grid: typeof gridData }>({
    keys: dayKeys,
    grid: gridData,
  });
  if (logReconcileKey.keys !== dayKeys || logReconcileKey.grid !== gridData) {
    setLogReconcileKey({ keys: dayKeys, grid: gridData });
    setOptimisticTimeLogs((prev) => {
      let didChange = false;
      const next = new Map(prev);

      prev.forEach((change, cellKey) => {
        const [dateKey] = cellKey.split("|");
        if (!dayKeys.has(dateKey)) return;

        const persisted = gridData.get(cellKey);
        const matchesPersisted = change.activityName === null
          ? !persisted
          : persisted?.id === change.rowId && persisted.activityName === change.activityName;

        if (matchesPersisted) {
          next.delete(cellKey);
          didChange = true;
        }
      });

      return didChange ? next : prev;
    });
  }

  const [ratingReconcileKey, setRatingReconcileKey] = useState<{
    keys: typeof dayKeys;
    ids: typeof ratingsIdMap;
    scores: typeof ratingsMap;
  }>({ keys: dayKeys, ids: ratingsIdMap, scores: ratingsMap });
  if (
    ratingReconcileKey.keys !== dayKeys ||
    ratingReconcileKey.ids !== ratingsIdMap ||
    ratingReconcileKey.scores !== ratingsMap
  ) {
    setRatingReconcileKey({ keys: dayKeys, ids: ratingsIdMap, scores: ratingsMap });
    setOptimisticRatings((prev) => {
      let didChange = false;
      const next = new Map(prev);

      prev.forEach((change, dateKey) => {
        if (!dayKeys.has(dateKey)) return;

        const persistedId = ratingsIdMap.get(dateKey);
        const persistedScore = ratingsMap.get(dateKey) ?? null;
        const matchesPersisted = change.score === null
          ? !persistedId
          : Boolean(persistedId) && persistedId === change.rowId && persistedScore === change.score;

        if (matchesPersisted) {
          next.delete(dateKey);
          didChange = true;
        }
      });

      return didChange ? next : prev;
    });
  }

  const scopedOptimisticTimeLogs = useMemo(() => {
    const map = new Map<string, OptimisticTimeLogChange>();
    optimisticTimeLogs.forEach((change, cellKey) => {
      if (dayKeys.has(cellKey.split("|")[0])) map.set(cellKey, change);
    });
    return map;
  }, [dayKeys, optimisticTimeLogs]);

  const scopedOptimisticRatings = useMemo(() => {
    const map = new Map<string, OptimisticRatingChange>();
    optimisticRatings.forEach((change, dateKey) => {
      if (dayKeys.has(dateKey)) map.set(dateKey, change);
    });
    return map;
  }, [dayKeys, optimisticRatings]);

  const setRating = useCallback(
    async (dateKey: string, score: number) => {
      const existingId = ratingsIdMap.get(dateKey);
      const persistedScore = ratingsMap.get(dateKey) ?? null;
      const optimisticEntry = optimisticRatings.get(dateKey);
      const currentScore = optimisticEntry ? optimisticEntry.score : persistedScore;
      // Picking the score already set clears it — the toggle the grid expects.
      const nextScore = currentScore === score ? null : score;

      if (!existingId) {
        cancelExecute(`daily-rating:${dateKey}`);

        if (nextScore === null) {
          setOptimisticRatings((prev) => {
            if (!prev.has(dateKey)) return prev;
            const next = new Map(prev);
            next.delete(dateKey);
            return next;
          });
          return;
        }

        const rowId = optimisticEntry?.rowId ?? uuidv4();
        setOptimisticRatings((prev) => {
          const next = new Map(prev);
          next.set(dateKey, { rowId, score: nextScore });
          return next;
        });

        const userId = await getCurrentUserId();
        // Another click may have landed while awaiting the user id.
        const latest = optimisticRatingsRef.current.get(dateKey);
        if (!latest || latest.rowId !== rowId || latest.score !== nextScore) return;

        debouncedExecute(
          `INSERT INTO daily_ratings (id, user_id, rating_date, score, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
          [rowId, userId, dateKey, nextScore],
          `daily-rating:${dateKey}`,
        );
        return;
      }

      const entityId = `daily-rating:${existingId}`;
      cancelExecute(entityId);

      if (nextScore === null) {
        cancelUpdate(existingId, "score", "daily_ratings");
        debouncedExecute("DELETE FROM daily_ratings WHERE id = ?", [existingId], entityId);
        setOptimisticRatings((prev) => {
          const next = new Map(prev);
          next.set(dateKey, { rowId: existingId, score: null });
          return next;
        });
        return;
      }

      if (persistedScore === nextScore) {
        cancelUpdate(existingId, "score", "daily_ratings");
        setOptimisticRatings((prev) => {
          if (!prev.has(dateKey)) return prev;
          const next = new Map(prev);
          next.delete(dateKey);
          return next;
        });
        return;
      }

      debouncedUpdate(existingId, "score", nextScore, "daily_ratings");
      setOptimisticRatings((prev) => {
        const next = new Map(prev);
        next.set(dateKey, { rowId: existingId, score: nextScore });
        return next;
      });
    },
    [optimisticRatings, ratingsIdMap, ratingsMap],
  );

  const setCell = useCallback(
    async (day: Date, hour: number, existing: GridCell | undefined, activity: string | null) => {
      const cellKey = hourCellKey(localDateKey(day), hour);
      const persistedCell = gridData.get(cellKey);
      const currentActivity = existing?.activityName ?? null;

      if (activity === currentActivity) return;

      // Local wall-clock parts as a UTC instant: the tracker's storage contract.
      const isoTimestamp = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour)).toISOString();

      if (!persistedCell?.id) {
        cancelExecute(`time-log:${cellKey}`);

        if (activity === null) {
          setOptimisticTimeLogs((prev) => {
            if (!prev.has(cellKey)) return prev;
            const next = new Map(prev);
            next.delete(cellKey);
            return next;
          });
          return;
        }

        const rowId = optimisticTimeLogs.get(cellKey)?.rowId ?? uuidv4();
        setOptimisticTimeLogs((prev) => {
          const next = new Map(prev);
          next.set(cellKey, { rowId, activityName: activity });
          return next;
        });

        const userId = await getCurrentUserId();
        const latest = optimisticTimeLogsRef.current.get(cellKey);
        if (!latest || latest.rowId !== rowId || latest.activityName !== activity) return;

        debouncedExecute(
          `INSERT INTO time_logs (id, user_id, activity_name, start_timestamp, duration_minutes, created_at)
           VALUES (?, ?, ?, ?, 60, ?)`,
          [rowId, userId, activity, isoTimestamp, new Date().toISOString()],
          `time-log:${cellKey}`,
        );
        return;
      }

      const entityId = `time-log:${persistedCell.id}`;
      cancelExecute(entityId);

      if (activity === null) {
        cancelUpdate(persistedCell.id, "activity_name", "time_logs");
        debouncedExecute("DELETE FROM time_logs WHERE id = ?", [persistedCell.id], entityId);
        setOptimisticTimeLogs((prev) => {
          const next = new Map(prev);
          next.set(cellKey, { rowId: persistedCell.id!, activityName: null });
          return next;
        });
        return;
      }

      if (persistedCell.activityName === activity) {
        cancelUpdate(persistedCell.id, "activity_name", "time_logs");
        setOptimisticTimeLogs((prev) => {
          if (!prev.has(cellKey)) return prev;
          const next = new Map(prev);
          next.delete(cellKey);
          return next;
        });
        return;
      }

      debouncedUpdate(persistedCell.id, "activity_name", activity, "time_logs");
      setOptimisticTimeLogs((prev) => {
        const next = new Map(prev);
        next.set(cellKey, { rowId: persistedCell.id!, activityName: activity });
        return next;
      });
    },
    [gridData, optimisticTimeLogs],
  );

  return {
    data: mergedGridData,
    ratings: mergedRatingsMap,
    activityTypes,
    colorMap,
    categoryMap,
    moods,
    isLoading: loadingActivities || loadingLogs,
    optimisticTimeLogs: scopedOptimisticTimeLogs,
    optimisticRatings: scopedOptimisticRatings,
    setCell,
    setRating,
  };
}
