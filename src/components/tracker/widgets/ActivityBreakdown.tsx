"use client";

import { useMemo, useState } from "react";
import { format, isAfter, startOfDay } from "date-fns";
import { cn } from "@/lib/shared/utils";
import { List, Moon, PieChart } from "lucide-react";
import { WidgetProps, COLOR_HEX } from "./types";
import { WidgetHeader, ToggleButton, WheelOverlay, HatchedEmpty } from "./shared";

export function ActivityBreakdown({ days, data, colorMap, categoryMap }: WidgetProps) {
  const [excludeSleep, setExcludeSleep] = useState(false);
  const [selectedSlice, setSelectedSlice] = useState<{ name: string; hours: number } | null>(null);
  const [showList, setShowList] = useState(false);
  const today = startOfDay(new Date());

  const activityHours = useMemo(() => {
    const validDates = new Set(days.filter((d) => !isAfter(startOfDay(d), today)).map((d) => format(d, "yyyy-MM-dd")));
    const counts: Record<string, number> = {};
    for (const [key, cell] of data) {
      const dateStr = key.split("|")[0];
      if (!validDates.has(dateStr)) continue;
      if (cell.activityName) {
        counts[cell.activityName] = (counts[cell.activityName] || 0) + 1;
      }
    }
    return counts;
  }, [data, days, today]);

  const slices = useMemo(() => {
    const entries = Object.entries(activityHours)
      .filter(([name]) => !excludeSleep || categoryMap[name] !== "sleep")
      .sort((a, b) => b[1] - a[1]);

    const total = entries.reduce((sum, [, h]) => sum + h, 0);
    if (total === 0) return [];

    return entries.map(([name, hours]) => ({
      name,
      hours,
      color: COLOR_HEX[colorMap[name]] || "#6b7280",
      percentage: (hours / total) * 100,
    }));
  }, [activityHours, colorMap, categoryMap, excludeSleep]);

  const piePaths = useMemo(() => {
    if (slices.length === 0) return [];
    const paths: { d: string; color: string; name: string; hours: number }[] = [];
    let currentAngle = -90;

    for (const slice of slices) {
      const angle = (slice.percentage / 100) * 360;
      const endAngle = currentAngle + angle;
      const startRad = (currentAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      const x1 = 50 + 40 * Math.cos(startRad);
      const y1 = 50 + 40 * Math.sin(startRad);
      const x2 = 50 + 40 * Math.cos(endRad);
      const y2 = 50 + 40 * Math.sin(endRad);
      const largeArc = angle > 180 ? 1 : 0;

      if (slices.length === 1) {
        paths.push({ d: `M 50 10 A 40 40 0 1 1 49.99 10 Z`, color: slice.color, name: slice.name, hours: slice.hours });
      } else {
        paths.push({ d: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`, color: slice.color, name: slice.name, hours: slice.hours });
      }
      currentAngle = endAngle;
    }
    return paths;
  }, [slices]);

  const totalTracked = Object.values(activityHours).reduce((a, b) => a + b, 0);
  const sleepHours = Object.entries(activityHours).reduce(
    (sum, [name, hours]) => sum + (categoryMap[name] === "sleep" ? hours : 0),
    0
  );
  const displayTotal = excludeSleep ? totalTracked - sleepHours : totalTracked;

  return (
    <div className="border border-border rounded-lg p-3 flex flex-col relative h-full min-h-[258px]">
      <WidgetHeader icon={PieChart} title="Activity" className="relative z-20">
          {slices.length > 0 && (
            <ToggleButton active={showList} onClick={() => { setShowList(!showList); setSelectedSlice(null); }} icon={List} />
          )}
          {sleepHours > 0 && (
            <ToggleButton active={excludeSleep} onClick={() => setExcludeSleep(!excludeSleep)} icon={Moon}>
              {excludeSleep ? "Hidden" : "Sleep"}
            </ToggleButton>
          )}
      </WidgetHeader>

      {/* Pie chart area */}
      <div className="flex-1 flex items-center justify-center">
        {totalTracked === 0 ? (
          <svg viewBox="0 0 100 100" className="h-52 w-52 sm:h-60 sm:w-60">
            <defs>
              <pattern id="hatch-activity" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.12" />
              </pattern>
            </defs>
            <circle cx="50" cy="50" r="40" fill="url(#hatch-activity)" />
            <circle cx="50" cy="50" r="22" fill="var(--background)" />
            <text x="50" y="52" textAnchor="middle" className="fill-muted-foreground text-[6px]">No data</text>
          </svg>
        ) : (
          <svg
            viewBox="0 0 100 100"
            className={cn("h-52 w-52 sm:h-60 sm:w-60 transition-all duration-300 ease-in-out", showList && "blur-sm opacity-40")}
          >
            {piePaths.map((path, i) => (
              <path
                key={path.name}
                d={path.d}
                fill={path.color}
                stroke="var(--background)"
                strokeWidth="0.5"
                className="cursor-pointer hover:opacity-80"
                style={{ transition: "d 0.4s ease-in-out, opacity 0.3s ease-in-out, fill 0.3s ease-in-out" }}
                onClick={(e) => { e.stopPropagation(); setSelectedSlice({ name: path.name, hours: path.hours }); setShowList(false); }}
              />
            ))}
            <circle cx="50" cy="50" r="22" fill="var(--background)" className="cursor-pointer" onClick={() => { setSelectedSlice(null); setShowList(true); }} />
            {selectedSlice ? (
              <>
                <text x="50" y="47" textAnchor="middle" className="fill-foreground text-[6px] font-bold pointer-events-none tabular-nums">
                  {selectedSlice.hours}h
                </text>
                <text x="50" y="56" textAnchor="middle" className="fill-muted-foreground text-[4px] pointer-events-none">
                  {selectedSlice.name}
                </text>
              </>
            ) : (
              <>
                <text x="50" y="48" textAnchor="middle" className="fill-foreground text-[8px] font-bold pointer-events-none tabular-nums">
                  {displayTotal}h
                </text>
                <text x="50" y="57" textAnchor="middle" className="fill-muted-foreground text-[5px] pointer-events-none">
                  total
                </text>
              </>
            )}
          </svg>
        )}

        {/* List overlay - iOS wheel picker style */}
        {showList && slices.length > 0 && (
          <WheelOverlay items={slices} onClose={() => setShowList(false)} />
        )}
      </div>
    </div>
  );
}
