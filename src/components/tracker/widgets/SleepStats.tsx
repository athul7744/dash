"use client";

import { useMemo, useState } from "react";
import { format, isAfter, startOfDay } from "date-fns";
import { Moon } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { WidgetProps } from "./types";
import { WidgetHeader, HatchedEmpty } from "./shared";

export function SleepStats({ days, data }: WidgetProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const dailySleep: { day: string; letter: string; hours: number }[] = [];

    for (const day of days) {
      const dateKey = format(day, "yyyy-MM-dd");
      if (isAfter(startOfDay(day), today)) continue;
      let sleepHours = 0;
      for (let h = 0; h < 24; h++) {
        const key = `${dateKey}|${String(h).padStart(2, "0")}`;
        const cell = data.get(key);
        if (cell?.activityName?.toLowerCase() === "sleep") sleepHours++;
      }
      dailySleep.push({ day: format(day, "EEE"), letter: format(day, "EEEEE"), hours: sleepHours });
    }

    const withSleep = dailySleep.filter((d) => d.hours > 0);
    if (withSleep.length === 0) return null;

    const totalHours = withSleep.reduce((s, d) => s + d.hours, 0);
    const avg = Math.round((totalHours / withSleep.length) * 10) / 10;
    const min = Math.min(...withSleep.map((d) => d.hours));
    const max = Math.max(...withSleep.map((d) => d.hours));

    return { dailySleep, totalHours, avg, min, max, daysTracked: withSleep.length };
  }, [days, data]);

  if (!stats) {
    return (
      <div className="border border-border rounded-lg p-3">
        <WidgetHeader icon={Moon} title="Sleep" />
        <div className="mt-1">
          <HatchedEmpty id="hatch-sleep" label="No sleep data" className="h-[88px] rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-3 h-full">
      <WidgetHeader icon={Moon} title="Sleep" />

      <div className="flex items-baseline gap-4 mb-2">
        {selectedIdx !== null ? (
          <>
            <div>
              <span className="text-2xl font-bold text-foreground tabular-nums">{stats.dailySleep[selectedIdx].hours}</span>
              <span className="text-xs text-muted-foreground ml-1">h</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.dailySleep[selectedIdx].day}
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="text-2xl font-bold text-foreground tabular-nums">{stats.avg}</span>
              <span className="text-xs text-muted-foreground ml-1">h avg</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.min}–{stats.max}h range
            </div>
          </>
        )}
      </div>

      {/* Mini bar chart for daily sleep */}
      <div className="grid grid-cols-7 gap-1 h-12">
        {stats.dailySleep.map((d, i) => {
          const barHeight = d.hours > 0 ? Math.max((d.hours / 12) * 100, 8) : 0;
          const isSelected = selectedIdx === i;
          return (
            <div
              key={d.day}
              className={cn("flex flex-col items-center gap-0.5 h-full justify-end", d.hours > 0 && "cursor-pointer")}
              onClick={() => d.hours > 0 && setSelectedIdx(isSelected ? null : i)}
            >
              {d.hours > 0 && (
                <div
                  className={cn("w-full rounded-sm transition-all duration-300 ease-in-out", isSelected ? "bg-indigo-400" : "bg-indigo-500/60", selectedIdx !== null && !isSelected && "opacity-40")}
                  style={{ height: `${barHeight}%` }}
                  title={`${d.day}: ${d.hours}h`}
                />
              )}
              <span className={cn("text-[8px] transition-all duration-300 ease-in-out", isSelected ? "text-foreground font-medium" : "text-muted-foreground")}>{d.letter}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
