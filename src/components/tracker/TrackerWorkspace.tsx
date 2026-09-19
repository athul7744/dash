"use client";

import { usePowerSync } from "@powersync/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, getYear } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import { Timer, CalendarDays, Activity, Smile, Calendar } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { ActivityToolbar } from "@/components/tracker/ActivityToolbar";
import { TimeGrid, GridCell } from "@/components/tracker/TimeGrid";
import { ManageActivitiesDialog } from "@/components/tracker/ManageActivitiesDialog";
import { ManageMoodsDialog } from "@/components/tracker/ManageMoodsDialog";
import { WeekNavigator, WeekNavigatorFab } from "@/components/tracker/WeekNavigator";
import { WeekWidgets } from "@/components/tracker/widgets";
import { WeekJournalDiary } from "@/components/journal/WeekJournalDiary";
import { WeekViewSkeleton } from "@/components/tracker/WeekViewSkeleton";
import { YearActivityGrid } from "@/components/tracker/YearActivityGrid";
import { YearRatingGrid } from "@/components/tracker/YearRatingGrid";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { getCurrentUserId } from "@/lib/shared/auth";
import { getApp } from "@/lib/shared/apps";
import { flushAllUpdates } from "@/lib/shared/debounced-update";
import { flushAllBlockDocumentPersisters } from "@/lib/notes/editor/block-persister";
import { cn } from "@/lib/shared/utils";
import { DURATION, SPRING_SOFT } from "@/lib/shared/motion";
import { DEFAULT_ACTIVITIES } from "@/lib/tracker/activities";
import { DEFAULT_MOODS } from "@/lib/tracker/moods";
import { useTimeGrid } from "@/hooks/use-time-grid";
import { localDateKey } from "@/lib/tracker/day-keys";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const trackerApp = getApp("tracker");
const TRACKER_TABS = [
  { id: "week" as const, label: "Week", icon: CalendarDays },
  { id: "activity" as const, label: "Activity", icon: Activity },
  { id: "mood" as const, label: "Mood", icon: Smile },
];

type ViewMode = "week" | "activity" | "mood";

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
  const seededRef = useRef(false);

  // Clear the pending view once navigation lands on it (render-time guard, not
  // an effect, to avoid a cascading-render pass).
  if (pendingView !== null && pendingView === routeView) {
    setPendingView(null);
  }

  useEffect(() => {
    void getCurrentUserId();
  }, []);

  // Flush pending journal edits (10s block-store debounce) on hard page unload.
  useEffect(() => {
    const flush = () => {
      flushAllUpdates();
      void flushAllBlockDocumentPersisters();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

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

  // Build the 7-day window based on selected week (Mon–Sun)
  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  // Cells, ratings and their writes — shared with the Day surface.
  const grid = useTimeGrid(days);
  const { activityTypes, colorMap: activityColorMap, categoryMap: activityCategoryMap, moods } = grid;

  // Keep widget props consistent: only update when gridData belongs to current days.
  // useQuery resolves a frame late on week change, so widgets would briefly see
  // new days + stale data, causing an empty-state flash. Held as derived state
  // (updated at render time when fresh) so the last consistent set survives the
  // stale frame — no ref access during render.
  const isDataStale = useMemo(() => {
    if (grid.data.size === 0) return false; // genuinely empty week — not stale
    const firstKey = grid.data.keys().next().value as string | undefined;
    if (!firstKey) return false;
    const keyDate = firstKey.split("|")[0];
    const startDate = format(days[0], "yyyy-MM-dd");
    const endDate = format(days[days.length - 1], "yyyy-MM-dd");
    return keyDate < startDate || keyDate > endDate;
  }, [days, grid.data]);

  const [widgetData, setWidgetData] = useState({ days, data: grid.data, ratings: grid.ratings });
  if (
    !isDataStale &&
    (widgetData.days !== days || widgetData.data !== grid.data || widgetData.ratings !== grid.ratings)
  ) {
    setWidgetData({ days, data: grid.data, ratings: grid.ratings });
  }

  // The brush lives here; the hook takes the intent.
  const handleRate = useCallback((dateStr: string, score: number) => void grid.setRating(dateStr, score), [grid]);

  const handleCellClick = useCallback(
    (day: Date, hour: number, existing: GridCell | undefined) => {
      if (!activeActivity) return;
      void grid.setCell(day, hour, existing, activeActivity === "__eraser__" ? null : activeActivity);
    },
    [activeActivity, grid],
  );

  const showSkeleton = grid.isLoading;

  // A day in a year heatmap opens that day. It used to jump to the day's week,
  // which was the closest thing to a day view before one existed.
  const handleDayClick = (date: Date) => router.push(`/day/${localDateKey(date)}`);

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
                  <TimeGrid days={days} data={grid.data} colorMap={activityColorMap} onCellClick={handleCellClick} ratings={grid.ratings} onRate={handleRate} moods={moods} />
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
            optimisticTimeLogs={grid.optimisticTimeLogs}
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
            optimisticRatings={grid.optimisticRatings}
            optimisticTimeLogs={grid.optimisticTimeLogs}
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
