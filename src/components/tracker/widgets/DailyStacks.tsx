"use client";

import { useMemo, useState } from "react";
import { format, isAfter, startOfDay } from "date-fns";
import { Moon, BarChart3 } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { WidgetProps, COLOR_HEX } from "./types";
import { WidgetHeader, ToggleButton, DismissButton, WheelOverlay } from "./shared";

export function DailyStacks({ days, data, colorMap, categoryMap }: WidgetProps) {
  const [excludeSleep, setExcludeSleep] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const today = startOfDay(new Date());

  const dailyData = useMemo(() => {
    return days.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const isFuture = isAfter(startOfDay(day), today);
      const activities: Record<string, number> = {};
      let total = 0;

      for (let h = 0; h < 24; h++) {
        const key = `${dateKey}|${String(h).padStart(2, "0")}`;
        const cell = data.get(key);
        if (cell?.activityName) {
          if (excludeSleep && categoryMap[cell.activityName] === "sleep") continue;
          activities[cell.activityName] = (activities[cell.activityName] || 0) + 1;
          total++;
        }
      }

      // Sort by hours descending for consistent stacking
      const segments = Object.entries(activities)
        .sort((a, b) => b[1] - a[1])
        .map(([name, hours]) => ({
          name,
          hours,
          color: COLOR_HEX[colorMap[name]] || "#6b7280",
          percentage: total > 0 ? (hours / 24) * 100 : 0,
        }));

      return { day: format(day, "EEE"), letter: format(day, "EEEEE"), segments, total, isFuture };
    });
  }, [days, data, colorMap, categoryMap, excludeSleep, today]);

  const totalHours = dailyData.filter((d) => !d.isFuture).reduce((s, d) => s + d.total, 0);

  return (
    <div className="border border-border rounded-lg p-3 flex flex-col relative h-full min-h-[258px]">
      {/* SVG pattern definition for future days */}
      <svg className="absolute h-0 w-0">
        <defs>
          <pattern id="hatch-future" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.15" />
          </pattern>
        </defs>
      </svg>

      <WidgetHeader icon={BarChart3} title="Daily" subtitle={totalHours > 0 ? `${totalHours}h` : undefined} className="relative z-20">
          {selectedDay !== null && (
            <DismissButton onClick={() => setSelectedDay(null)} />
          )}
          {totalHours > 0 && (
            <ToggleButton active={excludeSleep} onClick={() => setExcludeSleep(!excludeSleep)} icon={Moon}>
              {excludeSleep ? "Hidden" : "Sleep"}
            </ToggleButton>
          )}
      </WidgetHeader>

      <div className="flex-1">
        <div className={cn("grid grid-cols-7 gap-1 items-end h-full min-h-[80px] transition-all duration-300 ease-in-out", selectedDay !== null && "blur-sm opacity-40")}>
          {dailyData.map((d, i) => (
            <div
              key={d.day}
              className={cn("flex flex-col items-center gap-0.5 h-full justify-end", !d.isFuture && d.total > 0 && "cursor-pointer")}
              onClick={() => { if (!d.isFuture && d.total > 0) setSelectedDay(selectedDay === i ? null : i); }}
            >
              {/* Stacked bar or future placeholder */}
              {d.isFuture ? (
                <svg className="w-full rounded-sm overflow-hidden" style={{ height: "100%" }}>
                  <rect width="100%" height="100%" fill="url(#hatch-future)" />
                </svg>
              ) : d.total > 0 ? (
                <div className="w-full flex flex-col-reverse rounded-sm overflow-hidden" style={{ height: `${(d.total / 24) * 100}%`, minHeight: "6px", transition: "height 0.3s ease-in-out" }}>
                  {d.segments.map((seg, si) => (
                    <div
                      key={seg.name}
                      style={{ backgroundColor: seg.color, height: `${(seg.hours / d.total) * 100}%`, transition: "height 0.3s ease-in-out" }}
                      title={`${seg.name}: ${seg.hours}h`}
                    />
                  ))}
                </div>
              ) : null}
              {/* Hours label */}
              {d.total > 0 && <span className="text-[8px] text-foreground font-medium">{d.total}</span>}
              {/* Day label */}
              <span className={cn("text-[8px]", d.isFuture ? "text-muted-foreground/50" : "text-muted-foreground")}>{d.letter}</span>
            </div>
          ))}
        </div>

        {/* Overlay list for selected day */}
        {selectedDay !== null && dailyData[selectedDay].segments.length > 0 && (
          <WheelOverlay items={dailyData[selectedDay].segments} onClose={() => setSelectedDay(null)} />
        )}
      </div>
    </div>
  );
}
