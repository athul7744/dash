"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { format, isAfter, startOfDay } from "date-fns";
import { BarChart3, Zap } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { WidgetProps, COLOR_HEX } from "./types";
import { categoryToProductivityBucket } from "@/lib/tracker/activities";
import { WidgetHeader, ToggleButton, HatchedEmpty, ActivityItem } from "./shared";

type Category = "productive" | "passive" | "other";

export function ProductivityRatio({ days, data, colorMap, categoryMap }: WidgetProps) {
  const today = startOfDay(new Date());
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showDaily, setShowDaily] = useState(false);
  const [animated, setAnimated] = useState(false);
  const prevShowDailyRef = useRef(showDaily);

  // Synchronously reset animated to false when showDaily changes (before paint)
  if (prevShowDailyRef.current !== showDaily) {
    prevShowDailyRef.current = showDaily;
    setAnimated(false);
  }

  // After rendering with animated=false, schedule animated=true for next frame
  useEffect(() => {
    if (!animated) {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimated(true));
      });
      return () => cancelAnimationFrame(id);
    }
  }, [animated]);

  const stats = useMemo(() => {
    const validDates = new Set(days.filter((d) => !isAfter(startOfDay(d), today)).map((d) => format(d, "yyyy-MM-dd")));
    const counts = { productive: 0, passive: 0, other: 0 };
    const activities: Record<Category, Record<string, number>> = { productive: {}, passive: {}, other: {} };

    for (const [key, cell] of data) {
      const dateStr = key.split("|")[0];
      if (!validDates.has(dateStr)) continue;
      if (!cell.activityName) continue;
      const displayName = cell.activityName;

      const cat: Category = categoryToProductivityBucket(categoryMap[displayName]);

      counts[cat]++;
      activities[cat][displayName] = (activities[cat][displayName] || 0) + 1;
    }

    const total = counts.productive + counts.passive + counts.other;
    if (total === 0) return null;

    return {
      productive: counts.productive,
      passive: counts.passive,
      other: counts.other,
      total,
      ratio: Math.round((counts.productive / total) * 100),
      activities,
    };
  }, [data, days, today, categoryMap]);

  // Daily breakdown for the mini chart
  const dailyBreakdown = useMemo(() => {
    if (!showDaily) return null;
    return days.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const isFuture = isAfter(startOfDay(day), today);
      const counts = { productive: 0, passive: 0, other: 0 };

      if (!isFuture) {
        for (let h = 0; h < 24; h++) {
          const key = `${dateKey}|${String(h).padStart(2, "0")}`;
          const cell = data.get(key);
          if (!cell?.activityName) continue;
          counts[categoryToProductivityBucket(categoryMap[cell.activityName])]++;
        }
      }

      const total = counts.productive + counts.passive + counts.other;
      return { letter: format(day, "EEEEE"), isFuture, ...counts, total };
    });
  }, [showDaily, days, data, today, categoryMap]);

  // Activities for selected category
  const categoryActivities = useMemo(() => {
    if (!selectedCategory || !stats) return null;
    return Object.entries(stats.activities[selectedCategory])
      .sort((a, b) => b[1] - a[1])
      .map(([name, hours]) => ({ name, hours, color: COLOR_HEX[colorMap[name]] || "#6b7280" }));
  }, [selectedCategory, stats, colorMap]);

  return (
    <div className="border border-border rounded-lg p-3">
      <WidgetHeader icon={Zap} title="Productivity" subtitle={stats ? `${stats.total}h` : ""}>
          {stats && (
            <ToggleButton active={showDaily} onClick={() => { setShowDaily(!showDaily); setSelectedCategory(null); }} icon={BarChart3}>
              Daily
            </ToggleButton>
          )}
      </WidgetHeader>

      {!stats ? (
        <HatchedEmpty id="hatch-prod" className="h-3 rounded-full" />
      ) : showDaily && dailyBreakdown ? (
        <div className="min-h-[6.5rem]">
          {/* Daily mini stacked bars */}
          <div className="grid grid-cols-7 gap-1 items-end h-[4.5rem] mb-2">
            {dailyBreakdown.map((d, i) => {
              const maxH = 24;
              return (
                <div key={i} className="flex flex-col items-center gap-0.5 h-full justify-end">
                  {d.isFuture ? (
                    <div className="w-full h-full rounded-sm bg-muted/30" />
                  ) : d.total > 0 ? (
                    <div className="w-full flex flex-col-reverse rounded-sm overflow-hidden" style={{ height: animated ? `${(d.total / maxH) * 100}%` : "0%", minHeight: animated && d.total > 0 ? "4px" : "0", transition: "height 0.4s ease-out" }}>
                      {d.productive > 0 && <div className="bg-emerald-500" style={{ height: `${(d.productive / d.total) * 100}%`, transition: "height 0.3s ease-in-out" }} />}
                      {d.other > 0 && <div className="bg-slate-500" style={{ height: `${(d.other / d.total) * 100}%`, transition: "height 0.3s ease-in-out" }} />}
                      {d.passive > 0 && <div className="bg-orange-400" style={{ height: `${(d.passive / d.total) * 100}%`, transition: "height 0.3s ease-in-out" }} />}
                    </div>
                  ) : null}
                  <span className={cn("text-[8px]", d.isFuture ? "text-muted-foreground/50" : "text-muted-foreground")}>{d.letter}</span>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px]">
            <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">{stats.ratio}%</span></div>
            <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-500" /><span className="text-muted-foreground">{stats.other}h</span></div>
            <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" /><span className="text-muted-foreground">{stats.passive}h</span></div>
          </div>
        </div>
      ) : (
        <div className="min-h-[6.5rem] flex flex-col justify-center">
          {/* Stacked horizontal bar */}
          <div className="flex h-7 rounded-full overflow-hidden mb-2">
            {stats.productive > 0 && (
              <div
                className={cn("bg-emerald-500 transition-all duration-300 ease-in-out cursor-pointer", selectedCategory !== null && selectedCategory !== "productive" && "opacity-40")}
                style={{ width: animated ? `${(stats.productive / stats.total) * 100}%` : "0%", transition: "width 0.4s ease-out, opacity 0.3s ease-in-out" }}
                onClick={() => setSelectedCategory(selectedCategory === "productive" ? null : "productive")}
                title={`Productive: ${stats.productive}h`}
              />
            )}
            {stats.other > 0 && (
              <div
                className={cn("bg-slate-500 transition-all duration-300 ease-in-out cursor-pointer", selectedCategory !== null && selectedCategory !== "other" && "opacity-40")}
                style={{ width: animated ? `${(stats.other / stats.total) * 100}%` : "0%", transition: "width 0.4s ease-out, opacity 0.3s ease-in-out" }}
                onClick={() => setSelectedCategory(selectedCategory === "other" ? null : "other")}
                title={`Other: ${stats.other}h`}
              />
            )}
            {stats.passive > 0 && (
              <div
                className={cn("bg-orange-400 transition-all duration-300 ease-in-out cursor-pointer", selectedCategory !== null && selectedCategory !== "passive" && "opacity-40")}
                style={{ width: animated ? `${(stats.passive / stats.total) * 100}%` : "0%", transition: "width 0.4s ease-out, opacity 0.3s ease-in-out" }}
                onClick={() => setSelectedCategory(selectedCategory === "passive" ? null : "passive")}
                title={`Passive: ${stats.passive}h`}
              />
            )}
          </div>

          {/* Legend row */}
          <div className="flex items-center gap-4 text-[11px]">
            <div className={cn("flex items-center gap-1.5 cursor-pointer", selectedCategory !== null && selectedCategory !== "productive" && "opacity-40")} onClick={() => setSelectedCategory(selectedCategory === "productive" ? null : "productive")}>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Productive</span>
              <span className="font-medium text-foreground tabular-nums">{stats.productive}h ({stats.ratio}%)</span>
            </div>
            <div className={cn("flex items-center gap-1.5 cursor-pointer", selectedCategory !== null && selectedCategory !== "other" && "opacity-40")} onClick={() => setSelectedCategory(selectedCategory === "other" ? null : "other")}>
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <span className="text-muted-foreground">Other</span>
              <span className="font-medium text-foreground tabular-nums">{stats.other}h</span>
            </div>
            <div className={cn("flex items-center gap-1.5 cursor-pointer", selectedCategory !== null && selectedCategory !== "passive" && "opacity-40")} onClick={() => setSelectedCategory(selectedCategory === "passive" ? null : "passive")}>
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              <span className="text-muted-foreground">Passive</span>
              <span className="font-medium text-foreground tabular-nums">{stats.passive}h</span>
            </div>
          </div>

          {/* Expanded category activities */}
          {categoryActivities && categoryActivities.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border space-y-1">
              {categoryActivities.map((a) => (
                <ActivityItem key={a.name} name={a.name} color={a.color} value={`${a.hours}h`} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
