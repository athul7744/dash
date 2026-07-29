"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, getYear } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import { Timer, CalendarDays, Activity, Smile, Calendar } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { ActivityToolbar } from "@/components/tracker/ActivityToolbar";
import { TimeGrid, GridData, GridCell } from "@/components/tracker/TimeGrid";
import { ManageActivitiesDialog } from "@/components/tracker/ManageActivitiesDialog";
import { ManageMoodsDialog } from "@/components/tracker/ManageMoodsDialog";
import { WeekNavigator, WeekNavigatorFab } from "@/components/tracker/WeekNavigator";
import { WeekWidgets } from "@/components/tracker/widgets";
import { WeekJournalDiary } from "@/components/journal/WeekJournalDiary";
import { WeekViewSkeleton } from "@/components/tracker/WeekViewSkeleton";
import { YearActivityGrid } from "@/components/tracker/YearActivityGrid";
import { YearRatingGrid } from "@/components/tracker/YearRatingGrid";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { TimeLog, ActivityType, DailyRating } from "@/lib/powersync/AppSchema";
import { getCurrentUserId } from "@/lib/shared/auth";
import { getApp } from "@/lib/shared/apps";
import { cancelExecute, cancelUpdate, debouncedExecute, debouncedUpdate, flushAllUpdates } from "@/lib/shared/debounced-update";
import { flushAllBlockDocumentPersisters } from "@/lib/notes/editor/block-persister";
import { cn } from "@/lib/shared/utils";
import { DURATION, SPRING_SOFT } from "@/lib/shared/motion";
import { DEFAULT_ACTIVITIES, DEFAULT_ACTIVITY_CATEGORY, type ActivityCategory } from "@/lib/tracker/activities";
import { DEFAULT_MOODS } from "@/lib/tracker/moods";
import { useMoods } from "@/hooks/use-moods";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const trackerApp = getApp("tracker");
const TRACKER_TABS = [
  { id: "week" as const, label: "Week", icon: CalendarDays },
  { id: "activity" as const, label: "Activity", icon: Activity },
  { id: "mood" as const, label: "Mood", icon: Smile },
];

type ViewMode = "week" | "activity" | "mood";

interface OptimisticTimeLogChange {
  rowId: string;
  activityName: string | null;
}

interface OptimisticRatingChange {
  rowId: string;
  score: number | null;
}

/**
 * The whole tracker UI. Mounted by `tracker/layout.tsx` (not the page) so it
 * persists across `/tracker/<view>` segment changes — the view is read from the
 * pathname, so switching views is a re-render, never a remount or a route
 * loading-boundary flash. The `[view]` page and `loading.tsx` return null.
 */
export function TrackerWorkspace() {
  const db = usePowerSync();
  const reduce = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const [activeActivity, setActiveActivity] = useState<string | null>(null);
  // View is the path segment (/tracker/<view>); anything unexpected falls to week.
  const viewSeg = pathname.split("/")[2];
  const routeView: ViewMode = viewSeg === "activity" || viewSeg === "mood" ? viewSeg : "week";
  const [pendingView, setPendingView] = useState<ViewMode | null>(null);
  const view = pendingView ?? routeView;
  const setView = (nextView: ViewMode) => {
    if (nextView === routeView && pendingView === null) return;
    setPendingView(nextView);
    router.push(`/tracker/${nextView}`, { scroll: false });
  };
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedYear, setSelectedYear] = useState(() => getYear(new Date()));
  const [isManageActivitiesOpen, setIsManageActivitiesOpen] = useState(false);
  const [isManageMoodsOpen, setIsManageMoodsOpen] = useState(false);
  const [optimisticTimeLogs, setOptimisticTimeLogs] = useState<Map<string, OptimisticTimeLogChange>>(new Map());
  const [optimisticRatings, setOptimisticRatings] = useState<Map<string, OptimisticRatingChange>>(new Map());
  const optimisticTimeLogsRef = useRef(optimisticTimeLogs);
  const optimisticRatingsRef = useRef(optimisticRatings);
  const seededRef = useRef(false);

  // Clear the pending view once navigation lands on it (render-time guard, not
  // an effect, to avoid a cascading-render pass).
  if (pendingView !== null && pendingView === routeView) {
    setPendingView(null);
  }

  useEffect(() => {
    optimisticTimeLogsRef.current = optimisticTimeLogs;
  }, [optimisticTimeLogs]);

  useEffect(() => {
    optimisticRatingsRef.current = optimisticRatings;
  }, [optimisticRatings]);

  useEffect(() => {
    void getCurrentUserId();
  }, []);

  // Flush pending journal edits (10s block-store debounce) on hard page unload.
  useEffect(() => {
    const flush = () => {
      flushAllUpdates();
      flushAllBlockDocumentPersisters();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  // Query activity types from local DB
  const { data: activityTypes, isLoading: loadingActivities } = useQuery<ActivityType & { id: string }>(
    "SELECT * FROM activity_types ORDER BY created_at ASC"
  );

  // The user's configurable mood scale (worst→best).
  const moods = useMoods();

  // Seed defaults on first load if the user has no activity types / moods yet
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;

    (async () => {
      const userId = await getCurrentUserId();

      const existingActivities = await db.getAll("SELECT id FROM activity_types LIMIT 1");
      if (existingActivities.length === 0) {
        for (const a of DEFAULT_ACTIVITIES) {
          await db.execute(
            `INSERT INTO activity_types (id, user_id, name, color, category, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [uuidv4(), userId, a.name, a.color, a.category]
          );
        }
      }

      const existingMoods = await db.getAll("SELECT id FROM moods LIMIT 1");
      if (existingMoods.length === 0) {
        for (const m of DEFAULT_MOODS) {
          await db.execute(
            `INSERT INTO moods (id, user_id, label, color, value, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [uuidv4(), userId, m.label, m.color, m.value]
          );
        }
      }
    })();
  }, [db]);

  // Build a name→color map from the DB rows
  const activityColorMap = useMemo(
    () => Object.fromEntries(activityTypes.map((a) => [a.name, a.color ?? "teal"])),
    [activityTypes]
  );

  // Build a name→category map (drives the widgets' productive/rest/sleep semantics)
  const activityCategoryMap = useMemo<Record<string, ActivityCategory>>(
    () =>
      Object.fromEntries(
        activityTypes.map((a) => [a.name, ((a.category as ActivityCategory) ?? DEFAULT_ACTIVITY_CATEGORY)])
      ),
    [activityTypes]
  );

  // Build the 7-day window based on selected week (Mon–Sun)
  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  const rangeStart = format(days[0], "yyyy-MM-dd'T'00:00:00'+00:00'");
  const rangeEnd = format(days[days.length - 1], "yyyy-MM-dd'T'23:59:59'+00:00'");
  const currentDayKeys = useMemo(
    () => new Set(days.map((day) => format(day, "yyyy-MM-dd"))),
    [days]
  );

  // Subscribe to time_logs within the week window
  const { data: logs, isLoading: loadingLogs } = useQuery<TimeLog & { id: string }>(
    `SELECT id, activity_name, start_timestamp, duration_minutes
     FROM time_logs
     WHERE start_timestamp >= ? AND start_timestamp <= ?
     ORDER BY start_timestamp ASC`,
    [rangeStart, rangeEnd]
  );

  // Pivot logs into grid data
  const gridData: GridData = useMemo(() => {
    const map: GridData = new Map();
    for (const log of logs) {
      const ts = new Date(log.start_timestamp!);
      const dateKey = ts.toISOString().slice(0, 10);
      const hourKey = String(ts.getUTCHours()).padStart(2, "0");
      map.set(`${dateKey}|${hourKey}`, {
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
      if (!currentDayKeys.has(dateKey)) return;

      if (change.activityName === null) {
        map.delete(cellKey);
        return;
      }

      map.set(cellKey, { id: change.rowId, activityName: change.activityName });
    });

    return map;
  }, [currentDayKeys, gridData, optimisticTimeLogs]);

  // Query weekly ratings
  const weekRangeStartDate = format(days[0], "yyyy-MM-dd");
  const weekRangeEndDate = format(days[days.length - 1], "yyyy-MM-dd");
  const { data: weekRatings } = useQuery<DailyRating & { id: string }>(
    "SELECT * FROM daily_ratings WHERE rating_date >= ? AND rating_date <= ?",
    [weekRangeStartDate, weekRangeEndDate]
  );

  const ratingsMap = useMemo(
    () => new Map(weekRatings.filter((r) => r.rating_date).map((r) => [r.rating_date as string, r.score as number])),
    [weekRatings]
  );

  const mergedRatingsMap = useMemo(() => {
    const map = new Map(ratingsMap);

    optimisticRatings.forEach((change, dateStr) => {
      if (!currentDayKeys.has(dateStr)) return;

      if (change.score === null) {
        map.delete(dateStr);
        return;
      }

      map.set(dateStr, change.score);
    });

    return map;
  }, [currentDayKeys, optimisticRatings, ratingsMap]);

  const currentWeekOptimisticTimeLogs = useMemo(() => {
    const map = new Map<string, OptimisticTimeLogChange>();

    optimisticTimeLogs.forEach((change, cellKey) => {
      const [dateKey] = cellKey.split("|");
      if (!currentDayKeys.has(dateKey)) return;
      map.set(cellKey, change);
    });

    return map;
  }, [currentDayKeys, optimisticTimeLogs]);

  const currentWeekOptimisticRatings = useMemo(() => {
    const map = new Map<string, OptimisticRatingChange>();

    optimisticRatings.forEach((change, dateStr) => {
      if (!currentDayKeys.has(dateStr)) return;
      map.set(dateStr, change);
    });

    return map;
  }, [currentDayKeys, optimisticRatings]);

  const ratingsIdMap = useMemo(
    () => new Map(weekRatings.filter((r) => r.rating_date).map((r) => [r.rating_date as string, r.id])),
    [weekRatings]
  );

  // Drop optimistic entries once the persisted data catches up. Done as
  // render-time reconciliation (guarded on the source data's identity) rather
  // than an effect, so there's no extra cascading-render pass.
  const [tlReconcileKey, setTlReconcileKey] = useState<{ keys: typeof currentDayKeys; grid: typeof gridData }>({
    keys: currentDayKeys,
    grid: gridData,
  });
  if (tlReconcileKey.keys !== currentDayKeys || tlReconcileKey.grid !== gridData) {
    setTlReconcileKey({ keys: currentDayKeys, grid: gridData });
    setOptimisticTimeLogs((prev) => {
      let didChange = false;
      const next = new Map(prev);

      prev.forEach((change, cellKey) => {
        const [dateKey] = cellKey.split("|");
        if (!currentDayKeys.has(dateKey)) return;

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
    keys: typeof currentDayKeys;
    ids: typeof ratingsIdMap;
    scores: typeof ratingsMap;
  }>({ keys: currentDayKeys, ids: ratingsIdMap, scores: ratingsMap });
  if (
    ratingReconcileKey.keys !== currentDayKeys ||
    ratingReconcileKey.ids !== ratingsIdMap ||
    ratingReconcileKey.scores !== ratingsMap
  ) {
    setRatingReconcileKey({ keys: currentDayKeys, ids: ratingsIdMap, scores: ratingsMap });
    setOptimisticRatings((prev) => {
      let didChange = false;
      const next = new Map(prev);

      prev.forEach((change, dateStr) => {
        if (!currentDayKeys.has(dateStr)) return;

        const persistedId = ratingsIdMap.get(dateStr);
        const persistedScore = ratingsMap.get(dateStr) ?? null;
        const matchesPersisted = change.score === null
          ? !persistedId
          : Boolean(persistedId) && persistedId === change.rowId && persistedScore === change.score;

        if (matchesPersisted) {
          next.delete(dateStr);
          didChange = true;
        }
      });

      return didChange ? next : prev;
    });
  }

  // Keep widget props consistent: only update when gridData belongs to current days.
  // useQuery resolves a frame late on week change, so widgets would briefly see
  // new days + stale data, causing an empty-state flash. Held as derived state
  // (updated at render time when fresh) so the last consistent set survives the
  // stale frame — no ref access during render.
  const isDataStale = useMemo(() => {
    if (mergedGridData.size === 0) return false; // genuinely empty week — not stale
    const firstKey = mergedGridData.keys().next().value as string | undefined;
    if (!firstKey) return false;
    const keyDate = firstKey.split("|")[0];
    const startDate = format(days[0], "yyyy-MM-dd");
    const endDate = format(days[days.length - 1], "yyyy-MM-dd");
    return keyDate < startDate || keyDate > endDate;
  }, [days, mergedGridData]);

  const [widgetData, setWidgetData] = useState({ days, data: mergedGridData, ratings: mergedRatingsMap });
  if (
    !isDataStale &&
    (widgetData.days !== days || widgetData.data !== mergedGridData || widgetData.ratings !== mergedRatingsMap)
  ) {
    setWidgetData({ days, data: mergedGridData, ratings: mergedRatingsMap });
  }

  // Rating upsert handler
  const handleRate = useCallback(
    async (dateStr: string, score: number) => {
      const existingId = ratingsIdMap.get(dateStr);
      const persistedScore = ratingsMap.get(dateStr) ?? null;
      const optimisticEntry = optimisticRatings.get(dateStr);
      const currentScore = optimisticEntry ? optimisticEntry.score : persistedScore;
      const nextScore = currentScore === score ? null : score;

      if (!existingId) {
        cancelExecute(`daily-rating:${dateStr}`);

        if (nextScore === null) {
          setOptimisticRatings((prev) => {
            if (!prev.has(dateStr)) return prev;
            const next = new Map(prev);
            next.delete(dateStr);
            return next;
          });
          return;
        }

        const rowId = optimisticEntry?.rowId ?? uuidv4();
        setOptimisticRatings((prev) => {
          const next = new Map(prev);
          next.set(dateStr, { rowId, score: nextScore });
          return next;
        });

        const userId = await getCurrentUserId();
        const latest = optimisticRatingsRef.current.get(dateStr);
        if (!latest || latest.rowId !== rowId || latest.score !== nextScore) {
          return;
        }

        debouncedExecute(
          `INSERT INTO daily_ratings (id, user_id, rating_date, score, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
          [rowId, userId, dateStr, nextScore],
          `daily-rating:${dateStr}`
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
          next.set(dateStr, { rowId: existingId, score: null });
          return next;
        });
        return;
      }

      if (persistedScore === nextScore) {
        cancelUpdate(existingId, "score", "daily_ratings");
        setOptimisticRatings((prev) => {
          if (!prev.has(dateStr)) return prev;
          const next = new Map(prev);
          next.delete(dateStr);
          return next;
        });
        return;
      }

      debouncedUpdate(existingId, "score", nextScore, "daily_ratings");
      setOptimisticRatings((prev) => {
        const next = new Map(prev);
        next.set(dateStr, { rowId: existingId, score: nextScore });
        return next;
      });
    },
    [optimisticRatings, ratingsIdMap, ratingsMap]
  );

  // Cell click handler
  const handleCellClick = useCallback(
    async (day: Date, hour: number, existing: GridCell | undefined) => {
      if (!activeActivity) return;

      const dateKey = format(day, "yyyy-MM-dd");
      const hourKey = String(hour).padStart(2, "0");
      const cellKey = `${dateKey}|${hourKey}`;
      const persistedCell = gridData.get(cellKey);
      const nextActivity = activeActivity === "__eraser__" ? null : activeActivity;
      const currentActivity = existing?.activityName ?? null;

      if (nextActivity === currentActivity) return;

      const isoTimestamp = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour)).toISOString();

      if (!persistedCell?.id) {
        cancelExecute(`time-log:${cellKey}`);

        if (nextActivity === null) {
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
          next.set(cellKey, { rowId, activityName: nextActivity });
          return next;
        });

        const userId = await getCurrentUserId();
        const latest = optimisticTimeLogsRef.current.get(cellKey);
        if (!latest || latest.rowId !== rowId || latest.activityName !== nextActivity) {
          return;
        }

        debouncedExecute(
          `INSERT INTO time_logs (id, user_id, activity_name, start_timestamp, duration_minutes, created_at)
           VALUES (?, ?, ?, ?, 60, ?)`,
          [rowId, userId, nextActivity, isoTimestamp, new Date().toISOString()],
          `time-log:${cellKey}`
        );
        return;
      }

      const entityId = `time-log:${persistedCell.id}`;
      cancelExecute(entityId);

      if (nextActivity === null) {
        cancelUpdate(persistedCell.id, "activity_name", "time_logs");
        debouncedExecute("DELETE FROM time_logs WHERE id = ?", [persistedCell.id], entityId);
        setOptimisticTimeLogs((prev) => {
          const next = new Map(prev);
          next.set(cellKey, { rowId: persistedCell.id!, activityName: null });
          return next;
        });
        return;
      }

      if (persistedCell.activityName === nextActivity) {
        cancelUpdate(persistedCell.id, "activity_name", "time_logs");
        setOptimisticTimeLogs((prev) => {
          if (!prev.has(cellKey)) return prev;
          const next = new Map(prev);
          next.delete(cellKey);
          return next;
        });
        return;
      }

      debouncedUpdate(persistedCell.id, "activity_name", nextActivity, "time_logs");
      setOptimisticTimeLogs((prev) => {
        const next = new Map(prev);
        next.set(cellKey, { rowId: persistedCell.id!, activityName: nextActivity });
        return next;
      });
    },
    [activeActivity, gridData, optimisticTimeLogs]
  );

  const showSkeleton = loadingActivities || loadingLogs;

  // When clicking a day in the year rating grid, jump to that week
  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
    setView("week");
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden">
      <AppHeader
        app={trackerApp}
        mobileMenuItems={
          <>
            <DropdownMenuItem onClick={() => setIsManageActivitiesOpen(true)}>
              <span>Manage Activities</span>
              <Timer className="ml-auto h-4 w-4 text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsManageMoodsOpen(true)}>
              <span>Manage Moods</span>
              <Smile className="ml-auto h-4 w-4 text-muted-foreground" />
            </DropdownMenuItem>
          </>
        }
        actions={
          <>
            <ManageActivitiesDialog />
            <ManageMoodsDialog />
          </>
        }
      />

      <ManageActivitiesDialog open={isManageActivitiesOpen} onOpenChange={setIsManageActivitiesOpen} hideTrigger />
      <ManageMoodsDialog open={isManageMoodsOpen} onOpenChange={setIsManageMoodsOpen} hideTrigger />

      {/* View Tabs */}
      <div className="border-b border-border px-[var(--app-gutter-x)] flex items-center gap-1 overflow-x-auto overscroll-y-none [touch-action:pan-x_pan-y]">
        {TRACKER_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2 font-heading text-sm font-medium transition-colors whitespace-nowrap",
              view === id ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {view === id && (
              <motion.span
                layoutId="tracker-tab-underline"
                transition={reduce ? { duration: 0 } : SPRING_SOFT}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-teal-600 dark:bg-teal-400"
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-[var(--app-gutter-x)] py-4 pb-[var(--mobile-bottom-fab-clearance)] sm:pb-4 md:py-8">
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          // Instant exit so mode="wait" mounts the incoming view (and its
          // skeleton) immediately instead of holding on the old view's fade.
          exit={{ opacity: 0, transition: { duration: 0 } }}
          transition={{ duration: reduce ? 0 : DURATION.fast }}
          className="space-y-4"
        >
        {/* Week View */}
        {view === "week" && (
          <>
            <WeekNavigator currentDate={currentDate} onDateChange={setCurrentDate} />

            {showSkeleton ? (
              <WeekViewSkeleton />
            ) : (
              <div className={cn("min-w-0 overflow-x-hidden transition-opacity duration-150", isDataStale && "opacity-70")}>
                <section className="min-w-0 overflow-x-hidden [touch-action:pan-y]">
                  <ActivityToolbar
                    activities={activityTypes.map((a) => ({ name: a.name ?? "", color: a.color ?? "teal" }))}
                    active={activeActivity}
                    onSelect={setActiveActivity}
                  />
                </section>

                <section className="min-w-0 overflow-x-hidden">
                  <TimeGrid days={days} data={mergedGridData} colorMap={activityColorMap} onCellClick={handleCellClick} ratings={mergedRatingsMap} onRate={handleRate} moods={moods} />
                </section>

                {/* Below the full-width grid: analytics on the left, the journal
                    as a sticky readable column on the right (stacks on mobile). */}
                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] [touch-action:pan-y]">
                  <section className="min-w-0 overflow-x-hidden">
                    <WeekWidgets days={widgetData.days} data={widgetData.data} colorMap={activityColorMap} categoryMap={activityCategoryMap} ratings={widgetData.ratings} moods={moods} />
                  </section>

                  <section className="min-w-0 pb-16 sm:pb-0 lg:sticky lg:top-4 lg:self-start">
                    <WeekJournalDiary weekStart={days[0]} />
                  </section>
                </div>
              </div>
            )}
          </>
        )}

        {/* Year Activity Heatmap */}
        {view === "activity" && (
          <YearActivityGrid
            year={selectedYear}
            onDayClick={handleDayClick}
            optimisticTimeLogs={currentWeekOptimisticTimeLogs}
            headerLeft={
              <div className="flex items-center gap-2 shrink-0 pt-1 [touch-action:pan-y]">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedYear} onValueChange={(v: number | null) => v != null && setSelectedYear(parseInt(String(v), 10))}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          />
        )}

        {/* Year Rating Heatmap */}
        {view === "mood" && (
          <YearRatingGrid
            year={selectedYear}
            onDayClick={handleDayClick}
            moods={moods}
            optimisticRatings={currentWeekOptimisticRatings}
            optimisticTimeLogs={currentWeekOptimisticTimeLogs}
            headerLeft={
              <div className="flex items-center gap-2 shrink-0 [touch-action:pan-y]">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedYear} onValueChange={(v: number | null) => v != null && setSelectedYear(parseInt(String(v), 10))}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          />
        )}
        </motion.div>
        </AnimatePresence>
      </div>

      <MobileBottomFabs
        app={trackerApp}
        centerContent={view === "week" ? <WeekNavigatorFab currentDate={currentDate} onDateChange={setCurrentDate} /> : undefined}
        centerShellClassName="h-12 px-2.5 py-0"
      />
    </div>
  );
}
