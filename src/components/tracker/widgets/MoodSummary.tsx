"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Lightbulb, Smile } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { WidgetProps, RATING_COLORS, RATING_LABELS, COLOR_HEX } from "./types";
import { WidgetHeader, ToggleButton, DismissButton, HatchedEmpty, ActivityItem } from "./shared";

export function MoodSummary({ days, data, colorMap, ratings }: WidgetProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const insights = useMemo(() => {
    if (!ratings || ratings.size === 0) return null;
    const scores = Array.from(ratings.values());
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Best day: find highest-rated day and its top activity
    let bestDate: string | null = null;
    let bestScore = 0;
    for (const [dateStr, score] of ratings) {
      if (score > bestScore) { bestScore = score; bestDate = dateStr; }
    }

    let bestDayActivity: { name: string; hours: number; color: string } | null = null;
    if (bestDate) {
      const counts: Record<string, number> = {};
      for (let h = 0; h < 24; h++) {
        const key = `${bestDate}|${String(h).padStart(2, "0")}`;
        const cell = data.get(key);
        if (cell?.activityName && cell.activityName.toLowerCase() !== "sleep") {
          counts[cell.activityName] = (counts[cell.activityName] || 0) + 1;
        }
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top) {
        bestDayActivity = { name: top[0], hours: top[1], color: COLOR_HEX[colorMap[top[0]]] || "#6b7280" };
      }
    }

    // Streak: consecutive days rated 3+
    let streak = 0, maxStreak = 0;
    for (const day of days) {
      const score = ratings.get(format(day, "yyyy-MM-dd"));
      if (score && score >= 3) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else { streak = 0; }
    }

    // Sleep on good vs bad days
    let goodSleep = 0, goodCount = 0, badSleep = 0, badCount = 0;
    for (const [dateStr, score] of ratings) {
      let sleep = 0;
      for (let h = 0; h < 24; h++) {
        const key = `${dateStr}|${String(h).padStart(2, "0")}`;
        if (data.get(key)?.activityName?.toLowerCase() === "sleep") sleep++;
      }
      if (sleep > 0) {
        if (score >= 4) { goodSleep += sleep; goodCount++; }
        else if (score <= 2) { badSleep += sleep; badCount++; }
      }
    }

    return {
      avg: Math.round(avg * 10) / 10,
      count: scores.length,
      bestDayActivity,
      bestScore,
      streak: maxStreak,
      sleepGood: goodCount > 0 ? Math.round((goodSleep / goodCount) * 10) / 10 : null,
      sleepBad: badCount > 0 ? Math.round((badSleep / badCount) * 10) / 10 : null,
    };
  }, [ratings, data, days, colorMap]);

  // Per-day detail for selected dot
  const dayDetail = useMemo(() => {
    if (!selectedDay || !ratings) return null;
    const score = ratings.get(selectedDay);
    if (!score) return null;

    const counts: Record<string, number> = {};
    let sleepHours = 0;
    for (let h = 0; h < 24; h++) {
      const key = `${selectedDay}|${String(h).padStart(2, "0")}`;
      const cell = data.get(key);
      if (cell?.activityName) {
        if (cell.activityName.toLowerCase() === "sleep") {
          sleepHours++;
        } else {
          counts[cell.activityName] = (counts[cell.activityName] || 0) + 1;
        }
      }
    }
    const activities = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, hours]) => ({ name, hours, color: COLOR_HEX[colorMap[name]] || "#6b7280" }));

    const day = days.find((d) => format(d, "yyyy-MM-dd") === selectedDay);
    const dayName = day ? format(day, "EEEE") : selectedDay;

    return { score, label: RATING_LABELS[score], dayName, activities, sleepHours };
  }, [selectedDay, ratings, data, days, colorMap]);

  if (!insights || !ratings) {
    return (
      <div className="border border-border rounded-lg p-3">
        <WidgetHeader icon={Smile} title="Mood" />
        <div className="mt-1">
          <HatchedEmpty id="hatch-mood" label="Rate days to see stats" className="h-[88px] rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-3 flex flex-col relative h-full">
      <WidgetHeader icon={Smile} title="Mood" className="relative z-20">
          {dayDetail && (
            <DismissButton onClick={() => setSelectedDay(null)} />
          )}
          <ToggleButton active={showInsights} onClick={() => { setShowInsights(!showInsights); setSelectedDay(null); }} icon={Lightbulb}>
            Insights
          </ToggleButton>
      </WidgetHeader>

      {/* Score display */}
      <div className="flex items-baseline gap-4 mb-2">
        {dayDetail ? (
          <>
            <div>
              <span className="text-2xl font-bold text-foreground tabular-nums">{dayDetail.label}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {dayDetail.dayName}
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="text-2xl font-bold text-foreground tabular-nums">{insights.avg}</span>
              <span className="text-xs text-muted-foreground ml-1">avg</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {insights.count}/7 rated
            </div>
          </>
        )}
      </div>

      {/* Mood dots grid */}
      <div className="grid grid-cols-7 gap-1 place-items-center">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const score = ratings.get(dateKey);
          const isSelected = selectedDay === dateKey;
          return (
            <div
              key={dateKey}
              className="flex flex-col items-center gap-0.5 cursor-pointer"
              onClick={() => setSelectedDay(isSelected ? null : dateKey)}
            >
              <div
                className={cn(
                  "h-6 w-6 sm:h-5 sm:w-5 rounded-full transition-all duration-300 ease-in-out",
                  isSelected && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                  selectedDay !== null && !isSelected && "opacity-40"
                )}
                style={{ backgroundColor: score ? RATING_COLORS[score] : "var(--muted)" }}
                title={score ? `${format(day, "EEE")}: ${RATING_LABELS[score]}` : format(day, "EEE")}
              />
              <span className={cn("text-[8px] transition-all duration-300 ease-in-out", isSelected ? "text-foreground font-medium" : "text-muted-foreground")}>{format(day, "EEEEE")}</span>
            </div>
          );
        })}
      </div>

      {/* Insights overlay — week insights + per-day detail */}
      {(showInsights || dayDetail) && (
        <div
          className="absolute inset-x-0 top-8 bottom-0 flex flex-col rounded-b-lg overflow-hidden z-10"
          onClick={() => { setShowInsights(false); setSelectedDay(null); }}
        >
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          <div className="relative z-10 px-3 pt-3 pb-3 space-y-2 w-full overflow-y-auto flex-1" onClick={(e) => e.stopPropagation()}>
            {dayDetail ? (
              <>
                <div className="text-[11px] font-semibold text-foreground mb-1">{dayDetail.dayName} · {dayDetail.label}</div>
                {dayDetail.activities.map((a) => (
                  <ActivityItem key={a.name} name={a.name} color={a.color} value={`${a.hours}h`} />
                ))}
                {dayDetail.sleepHours > 0 && (
                  <div className="text-[11px] text-muted-foreground">😴 {dayDetail.sleepHours}h sleep</div>
                )}
                {dayDetail.activities.length === 0 && dayDetail.sleepHours === 0 && (
                  <div className="text-[11px] text-muted-foreground">No activities tracked</div>
                )}
              </>
            ) : (
              <>
                {insights.bestDayActivity && (
                  <ActivityItem name={insights.bestDayActivity.name} color={insights.bestDayActivity.color} value={`${insights.bestDayActivity.hours}h (best day)`} />
                )}
                {insights.streak > 0 && (
                  <div className="text-[11px] text-muted-foreground">🔥 {insights.streak}d streak (3+)</div>
                )}
                {insights.sleepGood !== null && insights.sleepBad !== null && (
                  <div className="text-[11px] text-muted-foreground">😴 Good days {insights.sleepGood}h vs bad {insights.sleepBad}h sleep</div>
                )}
                {insights.sleepGood !== null && insights.sleepBad === null && (
                  <div className="text-[11px] text-muted-foreground">😴 {insights.sleepGood}h sleep on good days</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
