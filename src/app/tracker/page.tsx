"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, getYear } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import { Timer, CalendarDays, Activity, Smile, Calendar } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { ActivityToolbar } from "@/components/tracker/ActivityToolbar";
import { TimeGrid, GridData, GridCell } from "@/components/tracker/TimeGrid";
import { ManageActivitiesDialog } from "@/components/tracker/ManageActivitiesDialog";
import { WeekNavigator, WeekNavigatorFab } from "@/components/tracker/WeekNavigator";
import { WeekWidgets } from "@/components/tracker/widgets";
import { WeeklyJournal } from "@/components/tracker/WeeklyJournal";
import { WeekViewSkeleton } from "@/components/tracker/WeekViewSkeleton";
import { YearActivityGrid } from "@/components/tracker/YearActivityGrid";
import { YearRatingGrid } from "@/components/tracker/YearRatingGrid";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { TimeLog, ActivityType, DailyRating } from "@/lib/powersync/AppSchema";
import { getCurrentUserId } from "@/lib/shared/auth";
import { getApp } from "@/lib/shared/apps";
import { cancelExecute, cancelUpdate, debouncedExecute, debouncedUpdate, flushAllUpdates } from "@/lib/shared/debounced-update";
import { flushAllNoteBlockStores } from "@/lib/notes/note-block-store";
import { cn } from "@/lib/shared/utils";
import { DEFAULT_ACTIVITIES } from "@/lib/tracker/activities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const trackerApp = getApp("tracker");
const TRACKER_TAB_ACTIVE_CLASS = "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400";

type ViewMode = "week" | "activity" | "mood";

interface OptimisticTimeLogChange {
  rowId: string;
  activityName: string | null;
}

interface OptimisticRatingChange {
  rowId: string;
  score: number | null;
}

export default function TrackerPage() {
  const db = usePowerSync();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeActivity, setActiveActivity] = useState<string | null>(null);
  const routeView = (searchParams.get("view") as ViewMode) || "week";
  const [pendingView, setPendingView] = useState<ViewMode | null>(null);
  const view = pendingView ?? routeView;
  const setView = (nextView: ViewMode) => {
    if (nextView === routeView && pendingView === null) return;
    setPendingView(nextView);
    router.push(`/tracker?view=${nextView}`, { scroll: false });
  };
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedYear, setSelectedYear] = useState(() => getYear(new Date()));
  const [isManageActivitiesOpen, setIsManageActivitiesOpen] = useState(false);
  const [optimisticTimeLogs, setOptimisticTimeLogs] = useState<Map<string, OptimisticTimeLogChange>>(new Map());
  const [optimisticRatings, setOptimisticRatings] = useState<Map<string, OptimisticRatingChange>>(new Map());
  const optimisticTimeLogsRef = useRef(optimisticTimeLogs);
  const optimisticRatingsRef = useRef(optimisticRatings);
  const seededRef = useRef(false);

  useEffect(() => {
    if (pendingView === routeView) {
      setPendingView(null);
    }
  }, [pendingView, routeView]);

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
      flushAllNoteBlockStores();
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

  // Seed defaults on first load if the user has no activity types
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;

    (async () => {
      const existing = await db.getAll("SELECT id FROM activity_types LIMIT 1");
      if (existing.length > 0) return;

      const userId = await getCurrentUserId();
      for (const a of DEFAULT_ACTIVITIES) {
        await db.execute(
          `INSERT INTO activity_types (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
          [uuidv4(), userId, a.name, a.color]
        );
      }
    })();
  }, [db]);

  // Build a name→color map from the DB rows
  const activityColorMap = useMemo(
    () => Object.fromEntries(activityTypes.map((a) => [a.name, a.color ?? "teal"])),
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

  useEffect(() => {
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
  }, [currentDayKeys, gridData]);

  useEffect(() => {
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
  }, [currentDayKeys, ratingsIdMap, ratingsMap]);

  // Keep widget props consistent: only update when gridData belongs to current days.
  // useQuery resolves a frame late on week change, so widgets would briefly see
  // new days + stale data, causing an empty-state flash.
  const widgetProps = useRef({ days, data: mergedGridData, ratings: mergedRatingsMap });
  const isDataStale = useMemo(() => {
    if (mergedGridData.size === 0) return false; // genuinely empty week — not stale
    const firstKey = mergedGridData.keys().next().value as string | undefined;
    if (!firstKey) return false;
    const keyDate = firstKey.split("|")[0];
    const startDate = format(days[0], "yyyy-MM-dd");
    const endDate = format(days[days.length - 1], "yyyy-MM-dd");
    return keyDate < startDate || keyDate > endDate;
  }, [days, mergedGridData]);

  if (!isDataStale) {
    widgetProps.current = { days, data: mergedGridData, ratings: mergedRatingsMap };
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
          <DropdownMenuItem onClick={() => setIsManageActivitiesOpen(true)}>
            <span>Manage Activities</span>
            <Timer className="ml-auto h-4 w-4 text-muted-foreground" />
          </DropdownMenuItem>
        }
        actions={<ManageActivitiesDialog />}
      />

      <ManageActivitiesDialog open={isManageActivitiesOpen} onOpenChange={setIsManageActivitiesOpen} hideTrigger />

      {/* View Tabs */}
      <div className="border-b border-border px-[var(--app-gutter-x)] flex items-center gap-1 overflow-x-auto overscroll-y-none [touch-action:pan-x_pan-y]">
        <button
          onClick={() => setView("week")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 font-heading text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
            view === "week" ? TRACKER_TAB_ACTIVE_CLASS : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Week
        </button>
        <button
          onClick={() => setView("activity")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 font-heading text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
            view === "activity" ? TRACKER_TAB_ACTIVE_CLASS : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          Activity
        </button>
        <button
          onClick={() => setView("mood")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 font-heading text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
            view === "mood" ? TRACKER_TAB_ACTIVE_CLASS : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Smile className="h-3.5 w-3.5" />
          Mood
        </button>
      </div>

      <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-[var(--app-gutter-x)] py-4 pb-[var(--mobile-bottom-fab-clearance)] space-y-4 sm:pb-4 md:py-8">
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
                  <TimeGrid days={days} data={mergedGridData} colorMap={activityColorMap} onCellClick={handleCellClick} ratings={mergedRatingsMap} onRate={handleRate} />
                </section>

                <section className="mt-4 min-w-0 overflow-x-hidden [touch-action:pan-y]">
                  <WeekWidgets days={widgetProps.current.days} data={widgetProps.current.data} colorMap={activityColorMap} ratings={widgetProps.current.ratings} />
                </section>

                <section className="mt-8 min-w-0 overflow-x-hidden pb-16 sm:pb-0 [touch-action:pan-y]">
                  <WeeklyJournal weekStart={days[0]} />
                </section>
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
                <Select value={selectedYear} onValueChange={(v: any) => setSelectedYear(parseInt(String(v), 10))}>
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
            optimisticRatings={currentWeekOptimisticRatings}
            optimisticTimeLogs={currentWeekOptimisticTimeLogs}
            headerLeft={
              <div className="flex items-center gap-2 shrink-0 [touch-action:pan-y]">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedYear} onValueChange={(v: any) => setSelectedYear(parseInt(String(v), 10))}>
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
      </div>

      <MobileBottomFabs
        app={trackerApp}
        centerContent={view === "week" ? <WeekNavigatorFab currentDate={currentDate} onDateChange={setCurrentDate} /> : undefined}
        centerShellClassName="h-12 px-2.5 py-0"
      />
    </div>
  );
}
