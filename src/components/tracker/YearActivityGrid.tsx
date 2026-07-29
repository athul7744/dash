"use client";

import { useQuery } from "@powersync/react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, startOfYear, endOfYear, eachDayOfInterval, getMonth, isEqual, startOfDay, differenceInCalendarDays } from "date-fns";
import { BarChart3, Grid3X3 } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { categoryToProductivityBucket, DEFAULT_ACTIVITY_CATEGORY, type ActivityCategory } from "@/lib/tracker/activities";
import { TimeLog, ActivityType } from "@/lib/powersync/AppSchema";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { COLOR_HEX } from "./widgets/types";
import { DayPopover } from "./DayPopover";
import { ActivityPillStrip } from "./ActivityPillStrip";

type YearSummary = {
  totalHours: number;
  activities: { name: string; count: number; hex: string; percentage: number }[];
  activeDays: number;
  longestStreak: number;
  elapsedDays: number;
  avgPerDay: number;
  focus: { productive: number; passive: number; other: number };
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Canvas grid constants
const LABEL_COL_WIDTH = 44;
const COMPACT_LABEL_COL_WIDTH = 34;
const HEADER_HEIGHT = 22;
const MIN_CELL_SIZE = 12;
const COMPACT_MIN_CELL_SIZE = 9;
const CELL_SIZE_STEPS = [12, 13, 14, 15, 16, 17] as const;
const COMPACT_CELL_SIZE_STEPS = [9, 10, 11, 12, 13, 14] as const;
const CELL_GAP = 3;
const COMPACT_CELL_GAP = 2;
const FRAME_HORIZONTAL_INSET = 8;
const VISIBLE_DAY_ROWS = 42;
const CELL_SIZE_STEP_WIDTH = 56;
const YEAR_VIEW_SHELL_CLASS = "w-full";
const COMPACT_YEAR_GRID_BREAKPOINT = 420;
const MOBILE_YEAR_GRID_BREAKPOINT = 768;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getGridMetrics(containerWidth: number) {
  const useCompactLayout = containerWidth > 0 && containerWidth < COMPACT_YEAR_GRID_BREAKPOINT;
  const useFullWidthViewport = containerWidth > 0 && containerWidth < MOBILE_YEAR_GRID_BREAKPOINT;
  const labelColWidth = useCompactLayout ? COMPACT_LABEL_COL_WIDTH : LABEL_COL_WIDTH;
  const minCellSize = useCompactLayout ? COMPACT_MIN_CELL_SIZE : MIN_CELL_SIZE;
  const cellGap = useCompactLayout ? COMPACT_CELL_GAP : CELL_GAP;
  const cellSizeSteps = useCompactLayout ? COMPACT_CELL_SIZE_STEPS : CELL_SIZE_STEPS;
  const minStride = minCellSize + cellGap;
  const availableWidth = Math.max(0, containerWidth - labelColWidth - FRAME_HORIZONTAL_INSET * 2);
  const minimumGridWidth = HOURS.length * minStride;
  const extraWidth = Math.max(0, availableWidth - minimumGridWidth);
  const maxStepIndex = cellSizeSteps.length - 1;
  const requestedStepIndex = Math.floor(extraWidth / CELL_SIZE_STEP_WIDTH);
  const strideLimitedStepIndex = availableWidth > 0
    ? Math.max(0, Math.floor(availableWidth / HOURS.length) - minCellSize - cellGap)
    : 0;
  const stepIndex = clamp(Math.min(requestedStepIndex, strideLimitedStepIndex), 0, maxStepIndex);
  const baseCellSize = cellSizeSteps[stepIndex];
  const baseCellStride = baseCellSize + cellGap;
  const unusedWidth = Math.max(0, availableWidth - HOURS.length * baseCellStride);
  const fillCellSize = useFullWidthViewport ? baseCellSize + unusedWidth / HOURS.length : baseCellSize;
  const cellSize = fillCellSize;
  const cellStride = cellSize + cellGap;
  const cellRadius = clamp(Math.round(cellSize / 4), 3, 5);
  const frameInset = FRAME_HORIZONTAL_INSET;
  const contentWidth = labelColWidth + HOURS.length * cellStride;
  const frameWidth = contentWidth + frameInset * 2;
  const viewportWidth = containerWidth > 0
    ? (useFullWidthViewport ? containerWidth : Math.min(containerWidth, frameWidth))
    : frameWidth;

  return {
    cellRadius,
    cellGap,
    cellSize,
    cellStride,
    contentWidth,
    frameInset,
    frameWidth,
    gridWidth: HOURS.length * cellStride,
    labelColWidth,
    viewportWidth,
    viewportHeight: HEADER_HEIGHT + VISIBLE_DAY_ROWS * cellStride,
  };
}

interface YearActivityGridProps {
  year: number;
  onDayClick?: (date: Date) => void;
  /** Optional element rendered to the left of the activity filter toolbar */
  headerLeft?: React.ReactNode;
  optimisticTimeLogs?: Map<string, { activityName: string | null }>;
}

export function YearActivityGrid({ year, onDayClick, headerLeft, optimisticTimeLogs }: YearActivityGridProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = element.clientWidth;
      setContainerWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Close popover on click outside
  useEffect(() => {
    if (!selectedDay) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSelectedDay(null);
        setPopoverPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedDay]);

  const yearStart = format(startOfYear(new Date(year, 0, 1)), "yyyy-MM-dd'T'00:00:00'+00:00'");
  const yearEnd = format(endOfYear(new Date(year, 0, 1)), "yyyy-MM-dd'T'23:59:59'+00:00'");

  const { data: activityTypes, isLoading: loadingTypes } = useQuery<ActivityType & { id: string }>(
    "SELECT * FROM activity_types ORDER BY created_at ASC"
  );

  const { data: logs, isLoading: loadingLogs } = useQuery<TimeLog & { id: string }>(
    `SELECT activity_name, start_timestamp FROM time_logs
     WHERE start_timestamp >= ? AND start_timestamp <= ?
     ORDER BY start_timestamp ASC`,
    [yearStart, yearEnd]
  );

  const colorMap = useMemo(
    () => Object.fromEntries(activityTypes.map((a) => [a.name, a.color ?? "teal"])),
    [activityTypes]
  );

  const categoryMap = useMemo(
    () => Object.fromEntries(activityTypes.map((a) => [a.name, (a.category as ActivityCategory) ?? DEFAULT_ACTIVITY_CATEGORY])) as Record<string, ActivityCategory>,
    [activityTypes]
  );

  const cellMap = useMemo(() => {
    const map = new Map<string, { color: string; activity: string }>();
    for (const log of logs) {
      const ts = new Date(log.start_timestamp!);
      const dateKey = ts.toISOString().slice(0, 10);
      const hourKey = String(ts.getUTCHours()).padStart(2, "0");
      const color = colorMap[log.activity_name ?? ""] ?? "teal";
      map.set(`${dateKey}|${hourKey}`, { color, activity: log.activity_name ?? "" });
    }

    optimisticTimeLogs?.forEach((change, cellKey) => {
      const [dateKey] = cellKey.split("|");
      if (dateKey.slice(0, 4) !== String(year)) return;

      if (change.activityName === null) {
        map.delete(cellKey);
        return;
      }

      map.set(cellKey, {
        color: colorMap[change.activityName] ?? "teal",
        activity: change.activityName,
      });
    });

    return map;
  }, [colorMap, logs, optimisticTimeLogs, year]);

  const allDays = useMemo(
    () => eachDayOfInterval({ start: startOfYear(new Date(year, 0, 1)), end: endOfYear(new Date(year, 0, 1)) }),
    [year]
  );

  // Build legend: unique activities that appear in data
  const legend = useMemo(() => {
    const seen = new Map<string, string>();
    for (const { activity, color } of cellMap.values()) {
      if (activity && !seen.has(activity)) seen.set(activity, color);
    }
    return Array.from(seen.entries()).map(([name, colorKey]) => ({ name, colorKey, hex: COLOR_HEX[colorKey] || "#6b7280" }));
  }, [cellMap]);

  // Day summary for selected day
  const daySummary = useMemo(() => {
    if (!selectedDay) return null;
    const dateKey = format(selectedDay, "yyyy-MM-dd");
    const activities: Record<string, { count: number; hex: string }> = {};
    for (let h = 0; h < 24; h++) {
      const key = `${dateKey}|${String(h).padStart(2, "0")}`;
      const cell = cellMap.get(key);
      if (cell) {
        if (!activities[cell.activity]) {
          activities[cell.activity] = { count: 0, hex: COLOR_HEX[cell.color] || "#6b7280" };
        }
        activities[cell.activity].count++;
      }
    }
    const totalHours = Object.values(activities).reduce((s, a) => s + a.count, 0);
    return { dateKey, totalHours, activities };
  }, [selectedDay, cellMap]);

  // Year rollup for the side summary panel — reuses the already-built cellMap
  // (each entry is one logged hour), so it costs one pass, no extra query.
  const yearSummary = useMemo<YearSummary>(() => {
    // Cells are keyed by UTC date/hour, so gate on a UTC "now" — future-dated
    // logs (e.g. backfilled sleep) must not count toward any figure here.
    const now = new Date();
    const nowDate = now.toISOString().slice(0, 10);
    const nowHour = now.getUTCHours();
    const isElapsed = (dateKey: string, hour: number) =>
      dateKey < nowDate || (dateKey === nowDate && hour <= nowHour);

    const perActivity = new Map<string, { count: number; hex: string }>();
    const activeDayKeys = new Set<string>();
    let totalHours = 0;
    for (const [key, cell] of cellMap) {
      const [dateKey, hh] = key.split("|");
      if (!isElapsed(dateKey, Number(hh))) continue;
      totalHours += 1;
      activeDayKeys.add(dateKey);
      const cur = perActivity.get(cell.activity) ?? { count: 0, hex: COLOR_HEX[cell.color] || "#6b7280" };
      cur.count += 1;
      perActivity.set(cell.activity, cur);
    }
    const activities = Array.from(perActivity.entries())
      .map(([name, v]) => ({ name, ...v, percentage: totalHours ? (v.count / totalHours) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    // Productive / passive / other split from each activity's category.
    const focus = { productive: 0, passive: 0, other: 0 };
    for (const a of activities) {
      focus[categoryToProductivityBucket(categoryMap[a.name] ?? DEFAULT_ACTIVITY_CATEGORY)] += a.count;
    }

    // Longest run of consecutive calendar days with any log.
    const sortedDayTimes = Array.from(activeDayKeys).sort().map((d) => new Date(`${d}T00:00:00`).getTime());
    let longestStreak = 0;
    let run = 0;
    let prev: number | null = null;
    for (const t of sortedDayTimes) {
      run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1;
      if (run > longestStreak) longestStreak = run;
      prev = t;
    }

    // Elapsed window: never count the future. Past years count whole; the
    // current year counts up to today (and today up to the current hour).
    const thisYear = now.getFullYear();
    let elapsedDays: number;
    if (year > thisYear) elapsedDays = 0;
    else if (year < thisYear) elapsedDays = eachDayOfInterval({ start: startOfYear(new Date(year, 0, 1)), end: endOfYear(new Date(year, 0, 1)) }).length;
    else elapsedDays = differenceInCalendarDays(now, startOfYear(new Date(year, 0, 1))) + 1;
    const avgPerDay = elapsedDays > 0 ? Math.round((totalHours / elapsedDays) * 10) / 10 : 0;

    return { totalHours, activities, activeDays: activeDayKeys.size, longestStreak, elapsedDays, avgPerDay, focus };
  }, [cellMap, categoryMap, year]);

  const gridMetrics = useMemo(() => getGridMetrics(containerWidth), [containerWidth]);

  if (loadingTypes || loadingLogs) {
    return (
      <div ref={containerRef} className={cn(YEAR_VIEW_SHELL_CLASS, "space-y-3")}> 
        {/* Header skeleton: year selector + activity pills */}
        <div className="flex min-w-0 items-start gap-3 md:gap-4 [touch-action:pan-y]">
          {headerLeft}
          <div className="min-w-0 flex-1 overflow-x-auto pr-1">
            <div className="flex min-w-full flex-col gap-1.5 py-1">
              <div className="flex items-center gap-1.5 w-max">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-6 w-20 rounded-full bg-muted animate-pulse" />
                ))}
              </div>
              <div className="flex items-center gap-1.5 w-max">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-6 w-18 rounded-full bg-muted animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Grid skeleton + summary panel, centered together (matches the view) */}
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center lg:gap-6">
          <div className="relative overflow-x-hidden overflow-y-auto overscroll-x-none [touch-action:pan-y]" style={{ width: gridMetrics.viewportWidth, height: gridMetrics.viewportHeight }}>
            <div className="relative rounded-xl border border-border bg-card" style={{ width: gridMetrics.frameWidth }}>
              <table
                className="border-separate border-spacing-0 text-[10px]"
                style={{ width: gridMetrics.contentWidth, marginLeft: gridMetrics.frameInset }}
              >
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="sticky z-30 bg-card px-1 py-1.5" style={{ left: gridMetrics.frameInset, width: gridMetrics.labelColWidth, height: HEADER_HEIGHT }}>
                      <div className="h-2.5 w-7 bg-muted rounded animate-pulse" />
                    </th>
                    {HOURS.map((h) => (
                      <th
                        key={h}
                        className="px-0 py-1.5 text-center font-medium text-muted-foreground/60"
                        style={{ width: gridMetrics.cellStride, height: HEADER_HEIGHT }}
                      >
                        {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: VISIBLE_DAY_ROWS }).map((_, row) => (
                    <tr key={row} style={{ height: gridMetrics.cellStride }}>
                      <td className="sticky z-10 bg-card px-1 py-0" style={{ left: gridMetrics.frameInset, width: gridMetrics.labelColWidth }}>
                        <div className="h-2.5 w-8 bg-muted rounded animate-pulse" />
                      </td>
                      {HOURS.map((_, h) => (
                        <td key={h} className="p-0" style={{ width: gridMetrics.cellStride, height: gridMetrics.cellStride }}>
                          <div className={cn(
                            "animate-pulse",
                            ((row * 24 + h) * 13 + row) % 6 === 0 ? "bg-muted animate-pulse" : "bg-muted/30"
                          )}
                          style={{
                            width: gridMetrics.cellSize,
                            height: gridMetrics.cellSize,
                            borderRadius: gridMetrics.cellRadius,
                          }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <YearActivitySummarySkeleton />
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div ref={containerRef} className={cn(YEAR_VIEW_SHELL_CLASS, "space-y-4")}>
        {headerLeft && <div className="flex items-center gap-3 md:gap-4">{headerLeft}</div>}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Grid3X3 className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No activity data for {year}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn(YEAR_VIEW_SHELL_CLASS, "space-y-3")}>
      {/* Activity filter toolbar - two rows like week view, with headerLeft */}
    <div className="flex min-w-0 items-start gap-3 md:gap-4 animate-fade-slide-in [touch-action:pan-y]">
        {headerLeft}
        <ActivityPillStrip
          items={legend.map((item) => ({
            name: item.name,
            colorKey: item.colorKey,
            activeHex: item.hex,
          }))}
          active={activeFilter}
          onSelect={setActiveFilter}
        />
      </div>

      {/* Day popover */}
      <AnimatePresence>
        {daySummary && selectedDay && popoverPos && (
          <DayPopover
            ref={popoverRef}
            day={selectedDay}
            position={popoverPos}
            activities={Object.entries(daySummary.activities)
              .sort(([, a], [, b]) => b.count - a.count)
              .map(([name, { count, hex }]) => ({ name, count, hex }))}
            totalHours={daySummary.totalHours}
            showBars
            onClose={() => { setSelectedDay(null); setPopoverPos(null); }}
            onEditDay={() => { onDayClick?.(selectedDay); setSelectedDay(null); setPopoverPos(null); }}
          />
        )}
      </AnimatePresence>

      {/* Canvas grid + the year summary as a side column on desktop. The grid
          caps at ~540px, so the panel only fits alongside it at lg+; below that
          the summary opens from a floating button (see below). The pair is
          centered together on desktop. */}
      <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center lg:gap-6">
        <ActivityCanvas
          allDays={allDays}
          cellMap={cellMap}
          activeFilter={activeFilter}
          gridMetrics={gridMetrics}
          selectedDay={selectedDay}
          onDaySelect={(day, e) => {
            setSelectedDay((prev) => {
              const isSelected = prev && isEqual(startOfDay(day), startOfDay(prev));
              if (isSelected) {
                setPopoverPos(null);
                return null;
              }
              const x = Math.min(e.clientX + 8, window.innerWidth - 256);
              const y = Math.min(e.clientY - 20, window.innerHeight - 260);
              setPopoverPos({ x: Math.max(8, x), y: Math.max(8, y) });
              return day;
            });
          }}
        />

        <aside className="hidden lg:block lg:w-80 lg:shrink-0">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 font-heading text-sm font-semibold text-foreground">This year</h3>
            <YearSummaryContent summary={yearSummary} />
          </div>
        </aside>
      </div>

      {/* Below lg (mobile + tablet), the grid is too narrow to sit beside the
          panel, so open the summary from a floating button into a dialog. */}
      <button
        type="button"
        onClick={() => setSummaryOpen(true)}
        aria-label="Year summary"
        className={cn(
          "fixed left-1/2 z-50 inline-flex size-12 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-colors hover:bg-accent lg:hidden",
          summaryOpen && "hidden",
        )}
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <BarChart3 className="h-5 w-5" />
      </button>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent>
          <DialogTitle className="pr-8 font-heading">This year · {year}</DialogTitle>
          <div className="-mr-2 max-h-[70vh] overflow-y-auto pr-2">
            <YearSummaryContent summary={yearSummary} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Canvas-based activity grid — renders 8,760 cells as pixels for smooth scroll/filter */
function ActivityCanvas({ allDays, cellMap, activeFilter, gridMetrics, selectedDay, onDaySelect }: {
  allDays: Date[];
  cellMap: Map<string, { activity: string; color: string }>;
  activeFilter: string | null;
  gridMetrics: ReturnType<typeof getGridMetrics>;
  selectedDay: Date | null;
  onDaySelect: (day: Date, e: React.MouseEvent) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const hoveredRowRef = useRef<number | null>(null);
  const needsRedrawRef = useRef(false);
  const { cellRadius, cellSize, cellStride, frameInset, gridWidth, labelColWidth, viewportHeight } = gridMetrics;
  const gridHeight = Math.round(allDays.length * cellStride);
  // Resolve theme colors (cached, only recomputes when grid dimensions change)
  const themeColors = useMemo(() => {
    if (typeof document === "undefined") return { fgHighlight: "transparent", fgHover: "transparent", mutedBg: "transparent" };
    const tempEl = document.createElement("div");
    tempEl.style.position = "absolute";
    tempEl.style.visibility = "hidden";
    tempEl.style.pointerEvents = "none";
    document.body.appendChild(tempEl);
    const getColor = (varName: string, opacity = 1) => {
      tempEl.style.color = `var(${varName})`;
      const computed = getComputedStyle(tempEl).color;
      if (opacity >= 1) return computed;
      tempEl.style.color = `color-mix(in srgb, var(${varName}) ${Math.round(opacity * 100)}%, transparent)`;
      return getComputedStyle(tempEl).color;
    };
    const colors = {
      fgHighlight: getColor("--foreground", 0.08),
      fgHover: getColor("--foreground", 0.04),
      mutedBg: getColor("--muted-foreground", 0.15),
    };
    document.body.removeChild(tempEl);
    return colors;
    // Recompute on resize (theme may change with breakpoints); gridWidth is the resize signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridWidth]);

  // Draw the canvas (cells only, no labels)
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(gridWidth * dpr);
    const targetH = Math.round(gridHeight * dpr);
    // Only reset dimensions if they changed (resizing clears canvas)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, gridWidth, gridHeight);

    const { fgHighlight, fgHover, mutedBg } = themeColors;

    const selectedDateKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
    const hoveredRow = hoveredRowRef.current;

    for (let row = 0; row < allDays.length; row++) {
      const day = allDays[row];
      const dateKey = format(day, "yyyy-MM-dd");
      const y = row * cellStride;
      const isSelected = dateKey === selectedDateKey;
      const isHovered = row === hoveredRow;

      // Row highlight
      if (isSelected || isHovered) {
        ctx.fillStyle = isSelected ? fgHighlight : fgHover;
        ctx.fillRect(0, y, gridWidth, cellStride);
      }

      // Cells
      for (let h = 0; h < 24; h++) {
        const key = `${dateKey}|${String(h).padStart(2, "0")}`;
        const cell = cellMap.get(key);
        const x = h * cellStride;
        const hex = cell ? COLOR_HEX[cell.color] || "#6b7280" : undefined;

        if (!hex) {
          ctx.globalAlpha = activeFilter ? 0.05 : 0.1;
          ctx.fillStyle = mutedBg;
          roundRect(ctx, x, y, cellSize, cellSize, cellRadius);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          let targetAlpha = 1;
          if (activeFilter) {
            targetAlpha = cell!.activity === activeFilter ? 1 : 0.15;
          }
          ctx.globalAlpha = targetAlpha;
          ctx.fillStyle = hex;
          roundRect(ctx, x, y, cellSize, cellSize, cellRadius);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
  }, [allDays, cellMap, activeFilter, selectedDay, gridWidth, gridHeight, cellRadius, cellSize, cellStride, themeColors]);

  // Redraw immediately when inputs change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Redraw on hover change without triggering React state churn
  const scheduleHoverRedraw = useCallback(() => {
    if (needsRedrawRef.current) return;
    needsRedrawRef.current = true;
    requestAnimationFrame(() => {
      needsRedrawRef.current = false;
      drawCanvas();
    });
  }, [drawCanvas]);

  // Hit detection on canvas (coords relative to canvas, not container)
  const getCell = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = gridWidth / rect.width;
    const scaleY = gridHeight / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const row = Math.floor(y / cellStride);
    const col = Math.floor(x / cellStride);

    if (row < 0 || row >= allDays.length || col < 0 || col >= 24) return null;
    return { row, col };
  }, [allDays.length, gridWidth, gridHeight, cellStride]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (selectedDay) {
      if (tooltip) {
        setTooltip(null);
      }
      if (hoveredRowRef.current !== null) {
        hoveredRowRef.current = null;
        scheduleHoverRedraw();
      }
      return;
    }

    const hit = getCell(e);
    if (!hit) {
      setTooltip(null);
      if (hoveredRowRef.current !== null) {
        hoveredRowRef.current = null;
        scheduleHoverRedraw();
      }
      return;
    }
    if (hoveredRowRef.current !== hit.row) {
      hoveredRowRef.current = hit.row;
      scheduleHoverRedraw();
    }
    const day = allDays[hit.row];
    const dateKey = format(day, "yyyy-MM-dd");
    const key = `${dateKey}|${String(hit.col).padStart(2, "0")}`;
    const cell = cellMap.get(key);
    if (cell) {
      const rect = canvasRef.current!.getBoundingClientRect();
      setTooltip({
        text: `${cell.activity} · ${format(day, "MMM d")} ${String(hit.col).padStart(2, "0")}:00`,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 28,
      });
    } else {
      setTooltip(null);
    }
  }, [allDays, cellMap, getCell, scheduleHoverRedraw, selectedDay, tooltip]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const hit = getCell(e);
    if (!hit) return;
    setTooltip(null);
    if (hoveredRowRef.current !== null) {
      hoveredRowRef.current = null;
      scheduleHoverRedraw();
    }
    onDaySelect(allDays[hit.row], e);
  }, [allDays, getCell, onDaySelect, scheduleHoverRedraw]);

  const selectedDateKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;

  return (
    <div className="animate-fade-slide-in" style={{ animationDelay: "40ms" }}>
      <div
        ref={frameRef}
        className="relative rounded-xl border border-border bg-card overflow-hidden"
        style={{ width: gridMetrics.viewportWidth, height: viewportHeight }}
      >
        <div
          className="relative h-full overflow-x-hidden overflow-y-auto overscroll-x-none [touch-action:pan-y]"
          onMouseLeave={() => { setTooltip(null); hoveredRowRef.current = null; scheduleHoverRedraw(); }}
        >
          <table
            className="border-separate border-spacing-0 text-[10px]"
            style={{ width: gridMetrics.contentWidth, marginLeft: frameInset }}
          >
            <thead>
              <tr>
                <th className="sticky top-0 z-30 bg-card" style={{ left: frameInset, width: labelColWidth, height: HEADER_HEIGHT }} />
                {HOURS.map((h) => (
                  <th
                    key={h}
                    className="sticky top-0 z-20 bg-card text-center font-bold text-muted-foreground/60 px-0"
                    style={{ width: cellStride, height: HEADER_HEIGHT }}
                  >
                    {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDays.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const isFirstOfMonth = day.getDate() === 1;
                const isSelected = dateKey === selectedDateKey;
                return (
                  <tr key={dateKey} style={{ height: cellStride }}>
                    <td
                      className={cn(
                        "sticky bg-card px-1 whitespace-nowrap",
                        isFirstOfMonth ? "top-0 z-20 text-foreground font-bold" : "z-10 text-muted-foreground/60 text-[9px]",
                        isSelected && "text-foreground font-bold"
                      )}
                      style={isFirstOfMonth ? { top: HEADER_HEIGHT, left: frameInset, width: labelColWidth } : { left: frameInset, width: labelColWidth }}
                    >
                      {isFirstOfMonth ? MONTH_NAMES[getMonth(day)] : String(day.getDate())}
                    </td>
                    <td colSpan={24} className="p-0 h-0" />
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Canvas overlaid on cell area */}
          <canvas
            ref={canvasRef}
            className="absolute cursor-pointer"
            style={{ top: HEADER_HEIGHT, left: frameInset + labelColWidth, width: gridWidth, height: gridHeight }}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
          />
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none px-2 py-1 rounded bg-popover border border-border text-[10px] text-foreground shadow-md whitespace-nowrap z-50"
            style={{ left: frameInset + labelColWidth + tooltip.x, top: HEADER_HEIGHT + tooltip.y, transform: "translateX(-50%)" }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  );
}

/** The year rollup body — shared by the desktop side panel and the mobile dialog.
 * All figures cover the elapsed year only (see the `yearSummary` memo). */
function YearSummaryContent({ summary }: { summary: YearSummary }) {
  const { totalHours, activities, activeDays, longestStreak, avgPerDay, focus } = summary;

  if (totalHours === 0) {
    return <p className="text-sm text-muted-foreground">No activity logged yet.</p>;
  }

  return (
    <div className="space-y-5">
      {/* At a glance */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryStat label="Hours" value={totalHours} />
        <SummaryStat label="Per day" value={avgPerDay} />
        <SummaryStat label="Active days" value={activeDays} />
        <SummaryStat label="Streak" value={longestStreak} />
      </div>

      {/* Activity mix — share of logged time */}
      <section className="space-y-2">
        <SectionLabel>Activity mix</SectionLabel>
        <div className="flex items-center gap-4">
          <ActivityDonut slices={activities} totalHours={totalHours} />
          <ul className="min-w-0 flex-1 space-y-1.5">
            {activities.slice(0, 6).map((a) => (
              <li key={a.name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.hex }} />
                <span className="min-w-0 flex-1 truncate text-foreground">{a.name}</span>
                <span className="tabular-nums text-muted-foreground">{Math.round(a.percentage)}%</span>
              </li>
            ))}
            {activities.length > 6 && (
              <li className="pl-4 text-[0.7rem] text-muted-foreground">+{activities.length - 6} more</li>
            )}
          </ul>
        </div>
      </section>

      {/* Focus — productive / rest / other */}
      <FocusSection focus={focus} />
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <h4 className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>;
}

/** Desktop-only skeleton for the year-summary side panel (matches its shape:
 * stat tiles, an activity-mix donut + legend, and the focus bar). */
export function YearActivitySummarySkeleton() {
  return (
    <aside className="hidden w-80 shrink-0 lg:block">
      <div className="space-y-5 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-20" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-full" />
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-2.5 w-full rounded-full" />
          <div className="flex gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center">
      <div className="font-heading text-lg font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

/** Donut of activity share (percent of logged hours), total in the hole. */
function ActivityDonut({ slices, totalHours }: { slices: YearSummary["activities"]; totalHours: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0">
      <circle cx={50} cy={50} r={r} fill="none" stroke="var(--muted)" strokeWidth={15} />
      {slices.map((s, i) => {
        const len = (s.percentage / 100) * c;
        // Prefix sum of prior slices (n is small — the vocabulary of activities).
        const startPct = slices.slice(0, i).reduce((sum, x) => sum + x.percentage, 0);
        return (
          <circle
            key={s.name}
            cx={50}
            cy={50}
            r={r}
            fill="none"
            stroke={s.hex}
            strokeWidth={15}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-(startPct / 100) * c}
            transform="rotate(-90 50 50)"
          />
        );
      })}
      <text x={50} y={49} textAnchor="middle" className="fill-foreground" style={{ fontSize: 15, fontWeight: 700 }}>{totalHours}</text>
      <text x={50} y={61} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 7 }}>hours</text>
    </svg>
  );
}

/** Productive / rest / other as a segmented bar with percentages. */
function FocusSection({ focus }: { focus: YearSummary["focus"] }) {
  const total = focus.productive + focus.passive + focus.other;
  if (total === 0) return null;
  const parts = [
    { key: "productive", label: "Productive", hours: focus.productive, cls: "bg-emerald-500" },
    { key: "passive", label: "Rest", hours: focus.passive, cls: "bg-sky-500" },
    { key: "other", label: "Other", hours: focus.other, cls: "bg-muted-foreground/50" },
  ].filter((p) => p.hours > 0);
  return (
    <section className="space-y-2">
      <SectionLabel>Focus</SectionLabel>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.key} className={p.cls} style={{ width: `${(p.hours / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-1.5 text-[0.7rem]">
            <span className={cn("h-2 w-2 rounded-full", p.cls)} />
            <span className="text-foreground">{p.label}</span>
            <span className="tabular-nums text-muted-foreground">{Math.round((p.hours / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Draw a rounded rectangle path */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
