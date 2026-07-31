"use client";

import { useQuery } from "@powersync/react";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/hooks/use-mounted";
import {
  format,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  getDay,
  isToday,
} from "date-fns";
import { cn } from "@/lib/shared/utils";
import { BarChart3, Star } from "lucide-react";
import { DailyRating, TimeLog, ActivityType } from "@/lib/powersync/AppSchema";
import { ACTIVITY_CELL_CLASSES } from "@/lib/tracker/activities";
import { moodByValue, moodDotClass, moodHex, moodRange, type Mood } from "@/lib/tracker/moods";
import { computeMoodYearInsights } from "@/lib/tracker/year-insights";
import { MoodYearInsights } from "@/components/tracker/year-insights";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { COLOR_HEX } from "./widgets/types";
import { FilterPill } from "./FilterPill";
import { DayPopover } from "./DayPopover";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const YEAR_VIEW_SHELL_CLASS = "w-full";

interface YearRatingGridProps {
  year: number;
  onDayClick?: (date: Date) => void;
  headerLeft?: React.ReactNode;
  moods: Mood[];
  optimisticRatings?: Map<string, { score: number | null }>;
  optimisticTimeLogs?: Map<string, { activityName: string | null }>;
}

export function YearRatingGrid({ year, onDayClick, headerLeft, moods, optimisticRatings, optimisticTimeLogs }: YearRatingGridProps) {
  const range = moodRange(moods);
  const cellBgClass = (score: number | null | undefined): string | null => {
    const mood = moodByValue(moods, score);
    return mood ? ACTIVITY_CELL_CLASSES[mood.color] ?? null : null;
  };
  const [activeFilter, setActiveFilter] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  // Portal the mobile FAB to <body> so it's fixed to the viewport (not the
  // scrolling/animated view container) and lines up with the app-switcher FAB.
  const mounted = useMounted();
  const popoverRef = useRef<HTMLDivElement>(null);

  const yearStart = format(startOfYear(new Date(year, 0, 1)), "yyyy-MM-dd");
  const yearEnd = format(endOfYear(new Date(year, 0, 1)), "yyyy-MM-dd");

  const { data: ratings, isLoading } = useQuery<DailyRating & { id: string }>(
    "SELECT rating_date, score FROM daily_ratings WHERE rating_date >= ? AND rating_date <= ?",
    [yearStart, yearEnd]
  );

  // Activity data for day popover breakdown
  const { data: logs } = useQuery<TimeLog & { id: string }>(
    `SELECT activity_name, start_timestamp FROM time_logs
     WHERE start_timestamp >= ? AND start_timestamp <= ?
     ORDER BY start_timestamp ASC`,
    [`${yearStart}T00:00:00+00:00`, `${yearEnd}T23:59:59+00:00`]
  );

  const { data: activityTypes } = useQuery<ActivityType & { id: string }>(
    "SELECT name, color FROM activity_types"
  );

  const activityColorMap = useMemo(
    () => new Map(activityTypes.map((a) => [a.name, a.color ?? "teal"])),
    [activityTypes]
  );

  const ratingMap = useMemo(
    () => {
      const map = new Map(ratings.map((r) => [r.rating_date, r.score]));

      optimisticRatings?.forEach((change, dateStr) => {
        if (dateStr.slice(0, 4) !== String(year)) return;

        if (change.score === null) {
          map.delete(dateStr);
          return;
        }

        map.set(dateStr, change.score);
      });

      return map;
    },
    [optimisticRatings, ratings, year]
  );

  // Year mood rollups for the Insights dialog (future ratings excluded).
  const moodInsights = useMemo(() => {
    const clean = new Map<string, number>();
    for (const [date, score] of ratingMap) {
      if (date != null && score != null) clean.set(date, score);
    }
    return computeMoodYearInsights({ ratingMap: clean, moods, year, now: new Date() });
  }, [ratingMap, moods, year]);

  const activityCellMap = useMemo(() => {
    const map = new Map<string, { activity: string; hex: string }>();

    for (const log of logs) {
      const ts = new Date(log.start_timestamp!);
      const dateKey = ts.toISOString().slice(0, 10);
      const hourKey = String(ts.getUTCHours()).padStart(2, "0");
      const name = log.activity_name ?? "Unknown";
      const colorKey = activityColorMap.get(name) ?? "teal";
      map.set(`${dateKey}|${hourKey}`, { activity: name, hex: COLOR_HEX[colorKey] || "#6b7280" });
    }

    optimisticTimeLogs?.forEach((change, cellKey) => {
      const [dateKey] = cellKey.split("|");
      if (dateKey.slice(0, 4) !== String(year)) return;

      if (change.activityName === null) {
        map.delete(cellKey);
        return;
      }

      const colorKey = activityColorMap.get(change.activityName) ?? "teal";
      map.set(cellKey, {
        activity: change.activityName,
        hex: COLOR_HEX[colorKey] || "#6b7280",
      });
    });

    return map;
  }, [activityColorMap, logs, optimisticTimeLogs, year]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const monthDate = new Date(year, m, 1);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      const days = eachDayOfInterval({ start, end });
      let ratedCount = 0;
      let totalScore = 0;
      for (const day of days) {
        const score = ratingMap.get(format(day, "yyyy-MM-dd"));
        if (score) {
          ratedCount++;
          totalScore += score;
        }
      }
      const avg = ratedCount > 0 ? totalScore / ratedCount : 0;
      return { month: m, days, ratedCount, avg };
    });
  }, [year, ratingMap]);

  // Day summary for popover
  const dayInfo = useMemo(() => {
    if (!selectedDay) return null;
    const dateStr = format(selectedDay, "yyyy-MM-dd");
    const score = ratingMap.get(dateStr);

    // Build activity breakdown for selected day
    const activities: Record<string, { count: number; hex: string }> = {};
    for (let hour = 0; hour < 24; hour++) {
      const key = `${dateStr}|${String(hour).padStart(2, "0")}`;
      const cell = activityCellMap.get(key);
      if (!cell) continue;

      if (!activities[cell.activity]) {
        activities[cell.activity] = { count: 0, hex: cell.hex };
      }
      activities[cell.activity].count++;
    }
    const totalHours = Object.values(activities).reduce((s, a) => s + a.count, 0);

    return { dateStr, score: score ?? null, activities, totalHours };
  }, [activityCellMap, ratingMap, selectedDay]);

  // Close popover on click outside
  useEffect(() => {
    if (!selectedDay) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest(".mood-cell")) return;
        setSelectedDay(null);
        setPopoverPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedDay]);

  if (isLoading) {
    return (
      <div className={cn(YEAR_VIEW_SHELL_CLASS, "space-y-4")}>
        {/* Header skeleton */}
        <div className="flex items-center gap-3 md:gap-4 [touch-action:pan-y]">
          {headerLeft}
          <div className="min-w-0 flex items-center gap-1.5 overflow-x-auto overscroll-y-none [touch-action:pan-x_pan-y]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 w-16 rounded-full bg-muted animate-pulse" />
            ))}
          </div>
        </div>
        {/* Grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, m) => (
            <div key={m} className="border border-border rounded-xl bg-card/50 p-3">
              <div className="h-3.5 w-10 bg-muted animate-pulse rounded mx-auto mb-2" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-4 w-4 rounded-full mx-auto animate-pulse",
                      (m * 35 + i) % 5 === 0 ? "bg-muted-foreground/15" : "bg-muted/40"
                    )}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (ratingMap.size === 0) {
    return (
      <div className={cn(YEAR_VIEW_SHELL_CLASS, "space-y-4")}>
        <div className="flex items-center gap-3 md:gap-4">
          {headerLeft}
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Star className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No rating data for {year}</p>
        </div>
      </div>
    );
  }

  return (
      <div className={cn(YEAR_VIEW_SHELL_CLASS, "space-y-4")}>
      {/* Header: year selector + pill legend + insights */}
      <div className="flex items-center gap-3 md:gap-4 [touch-action:pan-y]">
        {headerLeft}
        <div className="min-w-0 flex flex-1 items-center gap-1.5 overflow-x-auto overscroll-y-none [touch-action:pan-x_pan-y]">
          {moods.map((mood) => (
            <FilterPill
              key={mood.id}
              label={mood.label}
              dotClass={moodDotClass(mood)}
              activeHex={moodHex(mood)}
              active={activeFilter === mood.value}
              onClick={() => setActiveFilter(activeFilter === mood.value ? null : mood.value)}
            />
          ))}
        </div>
        {/* Desktop trigger; on mobile/tablet the FAB below opens the same dialog.
            Uses an inset ring (not a border) so its height matches the pills. */}
        <button
          type="button"
          onClick={() => setInsightsOpen(true)}
          className="hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent hover:text-foreground lg:flex"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Insights
        </button>
      </div>

      {/* Below lg, open the insights from a centered floating button (matches
          Activity). Portalled to <body> so it's viewport-fixed (see `mounted`). */}
      {mounted &&
        createPortal(
          <button
            type="button"
            onClick={() => setInsightsOpen(true)}
            className={cn(
              "fixed left-1/2 z-50 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-accent lg:hidden",
              insightsOpen && "hidden",
            )}
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <BarChart3 className="h-4 w-4" />
            Insights
          </button>,
          document.body,
        )}

      <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
        <DialogContent className="grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)]">
          <DialogTitle className="pr-8 font-heading">Mood · {year}</DialogTitle>
          <div className="min-h-0">
            <MoodYearInsights insights={moodInsights} moods={moods} fill />
          </div>
        </DialogContent>
      </Dialog>

      {/* CSS for animations + filter */}
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to { opacity: 1; transform: none; }
        }
        .mood-cell {
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }
        .mood-cell:hover {
          transform: scale(1.6);
          z-index: 10;
          box-shadow: 0 0 0 2px var(--background), 0 0 0 3px var(--foreground);
        }
        ${activeFilter ? `
        .mood-grid .mood-cell:not([data-score="${activeFilter}"]) {
          opacity: 0.15 !important;
          transform: scale(0.85);
        }
        ` : ""}
      `}</style>

      {/* Day popover */}
      <AnimatePresence>
        {dayInfo && selectedDay && popoverPos && (
        <DayPopover
          ref={popoverRef}
          day={selectedDay}
          position={popoverPos}
          activities={Object.entries(dayInfo.activities)
            .sort(([, a], [, b]) => b.count - a.count)
            .map(([name, { count, hex }]) => ({ name, count, hex }))}
          totalHours={dayInfo.totalHours}
          onClose={() => { setSelectedDay(null); setPopoverPos(null); }}
          onEditDay={() => { onDayClick?.(selectedDay); setSelectedDay(null); setPopoverPos(null); }}
          header={
            dayInfo.score ? (
              <div className="flex items-center gap-2">
                <span className={cn("h-3 w-3 rounded-full", moodDotClass(moodByValue(moods, dayInfo.score)))} />
                <span className="text-xs text-foreground font-medium">
                  {moodByValue(moods, dayInfo.score)?.label ?? "—"}
                </span>
                <span className="text-xs text-muted-foreground">({dayInfo.score}/{range.max})</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No rating</span>
            )
          }
        />
        )}
      </AnimatePresence>

      {/* Month cards */}
      <div className="mood-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {months.map(({ month, days, ratedCount, avg }) => (
          <div
            key={month}
            className="border border-border rounded-xl bg-card/50 p-3 animate-[cardIn_0.3s_ease-out_both]"
            style={{ animationDelay: `${month * 40}ms` }}
          >
            {/* Month header with stats */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-foreground">
                {MONTH_NAMES[month]}
              </h3>
              {ratedCount > 0 && (
                <span className="text-[9px] text-muted-foreground">
                  {avg.toFixed(1)}★ · {ratedCount}d
                </span>
              )}
            </div>

            {/* Day-of-week labels */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_LABELS.map((d, i) => (
                <div key={i} className="text-[8px] text-muted-foreground/50 text-center font-medium">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid - circles */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: ((getDay(days[0]) + 6) % 7) }, (_, i) => (
                <div key={`pad-${i}`} className="h-4 w-4 mx-auto" />
              ))}
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const score = ratingMap.get(dateStr);
                const bgClass = cellBgClass(score);
                const today = isToday(day);
                const isSelected = selectedDay && format(selectedDay, "yyyy-MM-dd") === dateStr;

                return (
                  <button
                    key={dateStr}
                    data-score={score || undefined}
                    onClick={(e) => {
                      if (isSelected) {
                        setSelectedDay(null);
                        setPopoverPos(null);
                      } else {
                        setSelectedDay(day);
                        const x = Math.min(e.clientX + 8, window.innerWidth - 236);
                        const y = Math.min(e.clientY - 20, window.innerHeight - 200);
                        setPopoverPos({ x: Math.max(8, x), y: Math.max(8, y) });
                      }
                    }}
                    className={cn(
                      "mood-cell relative h-4 w-4 rounded-full mx-auto",
                      bgClass || "bg-muted/30",
                      today && "ring-[1.5px] ring-foreground ring-offset-1 ring-offset-background",
                      isSelected && "ring-2 ring-foreground"
                    )}
                    title={score ? `${format(day, "MMM d")}: ${score}/${range.max} (${moodByValue(moods, score)?.label ?? "—"})` : format(day, "MMM d")}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
