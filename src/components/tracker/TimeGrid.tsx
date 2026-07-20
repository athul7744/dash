"use client";

import { useEffect, useRef } from "react";
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
  const weekKey = days.length > 0 ? format(days[0], "yyyy-MM-dd") : "";
  const wrapperRef = useRef<HTMLDivElement>(null);
  const currentTimeCellRef = useRef<HTMLTableCellElement>(null);

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
          <tr className="border-b border-border">
            {ratings && (
              <th className="sticky left-0 z-10 bg-muted px-1 py-2 text-center font-semibold text-muted-foreground w-[52px] border-r border-b border-border">
                Mood
              </th>
            )}
            <th className={cn("sticky z-10 bg-muted px-3 py-2 text-left font-semibold text-muted-foreground min-w-[90px] border-r border-b border-border", ratings ? "left-[52px]" : "left-0")}>
              Day
            </th>
            {HOURS.map((h) => (
              <th
                key={h}
                className="px-1 py-2 text-center font-medium text-muted-foreground min-w-[44px] border-l border-border tabular-nums"
              >
                {String(h).padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day, rowIdx) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const now = new Date();
            const todayKey = format(now, "yyyy-MM-dd");
            const currentHour = now.getHours();
            const currentScore = ratings?.get(dateKey) ?? null;
            const currentRating = moodByValue(moods, currentScore);
            return (
              <tr
                key={dateKey}
                className="border-t border-border animate-[rowSlideIn_0.25s_ease-out_both]"
                style={{ animationDelay: `${rowIdx * 40}ms` }}
              >
                {ratings && (
                  <td className="sticky left-0 z-10 bg-muted px-1 py-1 border-r border-border w-[52px] box-border">
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
                <td className={cn("sticky z-10 bg-muted px-3 py-2 font-medium text-muted-foreground whitespace-nowrap border-r border-border", ratings ? "left-[52px]" : "left-0")}>
                  {format(day, "EEE, MMM d")}
                </td>
                {HOURS.map((h) => {
                  const key = `${dateKey}|${String(h).padStart(2, "0")}`;
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
                        "border-l border-border cursor-pointer text-center select-none transition-colors",
                        "h-9 w-11",
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
