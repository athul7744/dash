"use client";

import { useQuery } from "@powersync/react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/hooks/use-mounted";
import { format, startOfYear, endOfYear, eachDayOfInterval, getMonth, isEqual, startOfDay } from "date-fns";
import { BarChart3, Grid3X3 } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { DEFAULT_ACTIVITY_CATEGORY, type ActivityCategory } from "@/lib/tracker/activities";
import { TimeLog, ActivityType } from "@/lib/powersync/AppSchema";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { computeActivityYearInsights } from "@/lib/tracker/year-insights";
import { ActivityYearInsights, ActivityYearInsightsSkeleton } from "@/components/tracker/year-insights";
import { COLOR_HEX } from "./widgets/types";
import { DayPopover } from "./DayPopover";
import { ActivityPillStrip } from "./ActivityPillStrip";

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
  // Portal the mobile FAB to <body> so it's fixed to the viewport (not the
  // scrolling/animated view container) and lines up with the app-switcher FAB.
  const mounted = useMounted();
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

  // Year rollups for the insights panel — one pass over the already-built
  // cellMap (each entry is one logged hour); future-dated logs are excluded.
  const yearInsights = useMemo(
    () => computeActivityYearInsights({ cellMap, categoryMap, year, now: new Date() }),
    [cellMap, categoryMap, year],
  );

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

          <ActivityYearInsightsSkeleton />
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

        {/* Height pinned to the grid's viewport so the panel matches the grid;
            inside, only the activities list scrolls. */}
        <aside className="hidden lg:block lg:w-80 lg:shrink-0" style={{ height: gridMetrics.viewportHeight }}>
          <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 shrink-0 font-heading text-sm font-semibold text-foreground">This year</h3>
            <div className="min-h-0 flex-1">
              <ActivityYearInsights insights={yearInsights} fill />
            </div>
          </div>
        </aside>
      </div>

      {/* Below lg (mobile + tablet), the grid is too narrow to sit beside the
          panel, so open the summary from a floating button into a dialog.
          Portalled to <body> so it's viewport-fixed (see `mounted` above). */}
      {mounted &&
        createPortal(
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className={cn(
              "fixed left-1/2 z-50 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-accent lg:hidden",
              summaryOpen && "hidden",
            )}
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <BarChart3 className="h-4 w-4" />
            Insights
          </button>,
          document.body,
        )}

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)]">
          <DialogTitle className="pr-8 font-heading">This year · {year}</DialogTitle>
          <div className="min-h-0">
            <ActivityYearInsights insights={yearInsights} fill />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A cell's opacity for a given filter: matches → 1, others dimmed, empty faint. */
function cellFilterAlpha(hasHex: boolean, activity: string | undefined, filter: string | null): number {
  if (!filter) return hasHex ? 1 : 0.1;
  if (!hasHex) return 0.05;
  return activity === filter ? 1 : 0.15;
}

const FILTER_ANIM_MS = 220;

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
  const reduceMotion = useReducedMotion();
  // Filter selection is crossfaded on the canvas (cheap: one redraw loop, no DOM
  // transitions). `from`/`to` hold the previous and current filter; `progress`
  // eases 0→1 across the change, interpolating each cell's alpha.
  const fromFilterRef = useRef<string | null>(activeFilter);
  const toFilterRef = useRef<string | null>(activeFilter);
  const filterProgressRef = useRef(1);
  const filterRafRef = useRef<number | null>(null);
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

      // Cells. Alpha is crossfaded between the previous and current filter so
      // selecting/clearing an activity dims smoothly instead of snapping.
      const fromF = fromFilterRef.current;
      const toF = toFilterRef.current;
      const p = filterProgressRef.current;
      for (let h = 0; h < 24; h++) {
        const key = `${dateKey}|${String(h).padStart(2, "0")}`;
        const cell = cellMap.get(key);
        const x = h * cellStride;
        const hex = cell ? COLOR_HEX[cell.color] || "#6b7280" : undefined;
        const hasHex = !!hex;
        const activity = cell?.activity;

        const aTo = cellFilterAlpha(hasHex, activity, toF);
        ctx.globalAlpha = p >= 1 ? aTo : lerp(cellFilterAlpha(hasHex, activity, fromF), aTo, p);
        ctx.fillStyle = hasHex ? hex! : mutedBg;
        roundRect(ctx, x, y, cellSize, cellSize, cellRadius);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }, [allDays, cellMap, selectedDay, gridWidth, gridHeight, cellRadius, cellSize, cellStride, themeColors]);

  // Redraw immediately when data/dimensions change (filter is animated below).
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Animate the filter change: ease `progress` 0→1 over one short rAF loop,
  // redrawing the canvas each frame. One loop over the whole grid is far cheaper
  // than transitioning hundreds of DOM cells, so it stays smooth on mobile.
  useEffect(() => {
    const fromF = toFilterRef.current; // the currently-displayed filter
    toFilterRef.current = activeFilter;
    if (filterRafRef.current) {
      cancelAnimationFrame(filterRafRef.current);
      filterRafRef.current = null;
    }
    // No change (e.g. first mount) or reduced motion → settle instantly.
    if (fromF === activeFilter || reduceMotion) {
      fromFilterRef.current = activeFilter;
      filterProgressRef.current = 1;
      drawCanvas();
      return;
    }
    fromFilterRef.current = fromF;
    filterProgressRef.current = 0;
    // Start the clock on the first real frame (not now) — otherwise the first
    // rAF fires ~16–50ms late and, with an eased curve, the opening frame would
    // pop ~20% in instead of starting from the current state.
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / FILTER_ANIM_MS);
      filterProgressRef.current = 1 - Math.pow(1 - t, 3); // easeOutCubic
      drawCanvas();
      if (t < 1) {
        filterRafRef.current = requestAnimationFrame(tick);
      } else {
        filterProgressRef.current = 1;
        fromFilterRef.current = activeFilter;
        filterRafRef.current = null;
      }
    };
    filterRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (filterRafRef.current) cancelAnimationFrame(filterRafRef.current);
    };
  }, [activeFilter, reduceMotion, drawCanvas]);

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
