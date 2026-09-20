"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { hourCellKey, localDateKey } from "@/lib/tracker/day-keys";
import { cn } from "@/lib/shared/utils";
import { ACTIVITY_CELL_CLASSES } from "@/lib/tracker/activities";
import { moodByValue, moodDotClass, type Mood } from "@/lib/tracker/moods";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * The grid rules vertically only: hour columns are separated, days are not, so a
 * day reads as one unbroken strip of time.
 *
 * `border-separate` is required for sticky cells to work, and under it borders
 * set on a `<tr>` are ignored and two neighbours each drawing an edge stack into
 * a double-width line. So the rules live on the cells, and only one side of a
 * shared edge draws one — hour 00 leaves its left edge to the sticky Day
 * column's `border-r`.
 */
const hourBorder = (hour: number) => (hour > 0 ? "border-l border-border" : "");

/**
 * The grid's only shadow. The Mood and Day columns are sticky, and until the
 * grid has scrolled they sit flush with the hours; casting an edge only once
 * `scrollLeft > 0` is what tells you the hours pass *underneath* them rather
 * than ending there. Everything else stays flat.
 */
const STICKY_EDGE_SHADOW = "shadow-[8px_0_12px_-8px_rgba(15,23,42,0.45)] dark:shadow-[8px_0_14px_-8px_rgba(0,0,0,0.8)]";

export interface GridCell {
  /** PowerSync row id, if a log exists for this cell */
  id?: string;
  activityName?: string;
}

/** Map key: "YYYY-MM-DD|HH" */
export type GridData = Map<string, GridCell>;

interface TimeGridProps {
  /** Ordered newest-first array of Date objects representing each row day */
  days: Date[];
  data: GridData;
  /** Map from activity name → color key */
  colorMap: Record<string, string>;
  onCellClick: (day: Date, hour: number, existing: GridCell | undefined) => void;
  /** Map from "YYYY-MM-DD" → mood value */
  ratings?: Map<string, number>;
  onRate?: (dateStr: string, score: number) => void;
  /** The user's configured mood scale (worst→best). */
  moods: Mood[];
}

export function TimeGrid({ days, data, colorMap, onCellClick, ratings, onRate, moods }: TimeGridProps) {
  // Key for animation reset when week changes
  const weekKey = days.length > 0 ? localDateKey(days[0]) : "";
  const wrapperRef = useRef<HTMLDivElement>(null);
  const currentTimeCellRef = useRef<HTMLTableCellElement>(null);

  const [scrolledX, setScrolledX] = useState(false);

  const now = new Date();
  const todayKey = localDateKey(now);
  const currentHour = now.getHours();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const currentCell = currentTimeCellRef.current;
    if (!wrapper || !currentCell) return;

    requestAnimationFrame(() => {
      const targetLeft = currentCell.offsetLeft - (wrapper.clientWidth - currentCell.clientWidth) / 2;
      wrapper.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: "smooth",
      });
    });
  }, [weekKey]);

  return (
    <div
      ref={wrapperRef}
      onScroll={(event) => setScrolledX(event.currentTarget.scrollLeft > 0)}
      className="overflow-x-auto rounded-lg border border-border overscroll-y-none [touch-action:pan-x_pan-y]"
      key={weekKey}
    >
      <style>{`
        @keyframes rowSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
      <table className="border-separate border-spacing-0 w-max min-w-full text-xs">
        <thead>
          <tr>
            {ratings && (
              <th className="sticky left-0 z-30 bg-muted px-1 py-2 text-center font-semibold text-muted-foreground w-[52px] border-r border-b border-border">
                Mood
              </th>
            )}
            <th className={cn(
              "sticky z-30 bg-muted px-3 py-2 text-left font-semibold text-muted-foreground w-[120px] border-r border-b border-border transition-shadow duration-200",
              ratings ? "left-[52px]" : "left-0",
              scrolledX && STICKY_EDGE_SHADOW,
            )}>
              Day
            </th>
            {HOURS.map((h) => (
              <th
                key={h}
                className={cn(
                  "px-1 py-2 text-center font-medium text-muted-foreground min-w-[44px] border-b border-border tabular-nums",
                  hourBorder(h),
                )}
              >
                {String(h).padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day, rowIdx) => {
            const dateKey = localDateKey(day);
            const currentScore = ratings?.get(dateKey) ?? null;
            const currentRating = moodByValue(moods, currentScore);
            return (
              <tr
                key={dateKey}
                className="animate-[rowSlideIn_0.25s_ease-out_both]"
                style={{ animationDelay: `${rowIdx * 40}ms` }}
              >
                {ratings && (
                  <td className="sticky left-0 z-20 bg-muted px-1 py-1 border-r border-border w-[52px] box-border">
                    <Select
                      value={currentScore != null ? currentScore : null}
                      onValueChange={(v: number | null) => v != null && onRate?.(dateKey, Number(v))}
                    >
                      <SelectTrigger size="sm" className="w-7 h-7 px-0 justify-center border-none bg-transparent [&_svg]:hidden mx-auto">
                        <span className={cn(
                          "inline-block h-4 w-4 rounded-full border-2",
                          currentRating ? cn(moodDotClass(currentRating), "border-transparent") : "border-muted-foreground/40"
                        )} />
                      </SelectTrigger>
                      <SelectContent>
                        {moods.map((m) => (
                          <SelectItem key={m.id} value={m.value}>
                            <span className="flex items-center gap-2">
                              <span className={cn("inline-block h-3 w-3 rounded-full", moodDotClass(m))} />
                              {m.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}
                <td className={cn(
                  "sticky z-20 bg-muted p-0 font-medium text-muted-foreground whitespace-nowrap w-[120px] border-r border-border transition-shadow duration-200",
                  ratings ? "left-[52px]" : "left-0",
                  scrolledX && STICKY_EDGE_SHADOW,
                )}>
                  {/* The cell is the target, not just the words: padding moves
                      onto the link so the hit area is the column's full width
                      and the row's full height. */}
                  <Link
                    href={`/day/${dateKey}`}
                    title={`Open ${format(day, "d MMMM yyyy")}`}
                    className="flex h-full w-full items-center px-3 py-2 transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
                  >
                    {format(day, "EEE, MMM d")}
                  </Link>
                </td>
                {HOURS.map((h) => {
                  const key = hourCellKey(dateKey, h);
                  const cell = data.get(key);
                  const color = cell?.activityName
                    ? colorMap[cell.activityName]
                    : undefined;
                  const cellClasses = color
                    ? ACTIVITY_CELL_CLASSES[color]
                    : undefined;
                  const isCurrentTimeCell = dateKey === todayKey && h === currentHour;

                  return (
                    <td
                      key={h}
                      ref={isCurrentTimeCell ? currentTimeCellRef : null}
                      onClick={() => onCellClick(day, h, cell)}
                      className={cn(
                        "cursor-pointer text-center select-none transition-colors",
                        hourBorder(h),
                        "h-9 min-w-[44px]",
                        // Below the sticky columns' z-20: the hover ring is drawn
                        // outside the cell, so a lifted cell would otherwise paint
                        // over the Day column as the grid scrolls under it.
                        "hover:ring-2 hover:ring-primary/40 hover:z-10",
                        cellClasses ?? "hover:bg-accent/50"
                      )}
                      title={
                        cell?.activityName
                          ? `${cell.activityName} – ${String(h).padStart(2, "0")}:00`
                          : `${format(day, "EEE")} ${String(h).padStart(2, "0")}:00 (empty)`
                      }
                    >
                      {cell?.activityName ? cell.activityName.charAt(0) : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
