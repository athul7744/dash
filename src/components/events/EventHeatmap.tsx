"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { addDays, eachWeekOfInterval, format, startOfWeek, subWeeks } from "date-fns";

import { refKindAccentVar } from "@/lib/links/tokens";

const CELL = 11;
const GAP = 2.5;
const STRIDE = CELL + GAP;
const WEEKS = 53;
const ACCENT = refKindAccentVar("event");

/** Intensity → fill opacity for a day's occurrence count. */
function levelOpacity(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 0.35;
  if (count === 2) return 0.6;
  return 0.9;
}

/**
 * A compact one-year contribution heatmap for a single thing: weekday rows ×
 * week columns, each cell tinted by how many times it happened that day. SVG
 * (≈371 cells — cheap), theme-aware via the event accent + a muted empty cell.
 */
export function EventHeatmap({ dates }: { dates: string[] }) {
  const { weeks, monthMarks } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const iso of dates) {
      if (!iso) continue;
      const key = format(new Date(iso), "yyyy-MM-dd");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const end = startOfWeek(new Date(), { weekStartsOn: 0 });
    const start = subWeeks(end, WEEKS - 1);
    const weekStarts = eachWeekOfInterval({ start, end }, { weekStartsOn: 0 });
    const weeks = weekStarts.map((ws) =>
      Array.from({ length: 7 }, (_, d) => {
        const day = addDays(ws, d);
        const key = format(day, "yyyy-MM-dd");
        return { key, count: counts.get(key) ?? 0, day };
      }),
    );
    // A month label at each column where the month first appears (row 0).
    const monthMarks: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, col) => {
      const m = w[0].day.getMonth();
      if (m !== lastMonth) {
        monthMarks.push({ col, label: format(w[0].day, "MMM") });
        lastMonth = m;
      }
    });
    return { weeks, monthMarks };
  }, [dates]);

  const width = weeks.length * STRIDE;
  const height = 7 * STRIDE + 14;

  // The grid can be wider than its column; scroll to the most recent week so
  // today (the rightmost column) is visible instead of the oldest week.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [width]);

  return (
    <div ref={scrollerRef} className="mt-3 overflow-x-auto">
      <svg width={width} height={height} className="block" role="img" aria-label="Occurrence heatmap">
        {monthMarks.map((m) => (
          <text key={`${m.col}-${m.label}`} x={m.col * STRIDE} y={9} fontSize={8} className="fill-muted-foreground">
            {m.label}
          </text>
        ))}
        <g transform="translate(0,14)">
          {weeks.map((week, col) =>
            week.map((cell, row) => (
              <rect
                key={cell.key}
                x={col * STRIDE}
                y={row * STRIDE}
                width={CELL}
                height={CELL}
                rx={2}
                fill={cell.count > 0 ? ACCENT : "var(--muted)"}
                fillOpacity={cell.count > 0 ? levelOpacity(cell.count) : 0.5}
              >
                <title>{`${format(cell.day, "PP")} · ${cell.count} time${cell.count === 1 ? "" : "s"}`}</title>
              </rect>
            )),
          )}
        </g>
      </svg>
    </div>
  );
}
