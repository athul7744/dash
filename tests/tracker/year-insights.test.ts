/// <reference types="vitest/globals" />

import {
  computeActivityYearInsights,
  computeMoodYearInsights,
  type ActivityCell,
} from "@/lib/tracker/year-insights";
import { DEFAULT_MOODS, type Mood } from "@/lib/tracker/moods";
import type { ActivityCategory } from "@/lib/tracker/activities";

const CATEGORY_MAP: Record<string, ActivityCategory> = {
  Work: "productive",
  Sleep: "sleep",
  Scroll: "neutral",
};

const cell = (color: string, activity: string): ActivityCell => ({ color, activity });
const MOODS: Mood[] = DEFAULT_MOODS.map((m, i) => ({ id: `m${i}`, ...m }));

// A fixed "now": 2026-01-08 12:00 UTC. 2026-01-01 is a Thursday, so Jan 5 = Mon.
const NOW = new Date("2026-01-08T12:00:00Z");

/** Fill `hours` consecutive hour-cells (from hour 0) for one day/activity. */
function fillDay(map: Map<string, ActivityCell>, date: string, color: string, activity: string, hours: number) {
  for (let h = 0; h < hours; h += 1) map.set(`${date}|${String(h).padStart(2, "0")}`, cell(color, activity));
}

describe("computeActivityYearInsights — ranking, future exclusion, per-activity", () => {
  const cellMap = new Map<string, ActivityCell>([
    ["2026-01-05|09", cell("teal", "Work")], // Mon
    ["2026-01-05|10", cell("teal", "Work")], // Mon
    ["2026-01-06|22", cell("indigo", "Sleep")], // Tue
    ["2026-01-06|23", cell("indigo", "Sleep")], // Tue
    ["2026-01-08|13", cell("teal", "Work")], // today but future hour → excluded
    ["2026-01-09|09", cell("teal", "Work")], // future day → excluded
  ]);
  const result = computeActivityYearInsights({ cellMap, categoryMap: CATEGORY_MAP, year: 2026, now: NOW });

  it("excludes future-dated and future-hour cells", () => {
    expect(result.totalHours).toBe(4);
    expect(result.monthlyTotals[0]).toBe(4);
  });

  it("ranks activities by logged hours with share percentages", () => {
    expect(result.activities.map((a) => [a.name, a.hours, Math.round(a.percentage)])).toEqual([
      ["Work", 2, 50],
      ["Sleep", 2, 50],
    ]);
  });

  it("rolls up each activity's weekday average and cadence", () => {
    const work = result.activities.find((a) => a.name === "Work")!;
    // 8 elapsed days (Jan 1–8); Mon (Jan 5) appears once → 2 hrs / 1 Monday.
    expect(work.weekday).toEqual([2, 0, 0, 0, 0, 0, 0]);
    expect(work.activeDays).toBe(1);
    expect(work.avgPerActiveDay).toBe(2);
    expect(work.longestStreak).toBe(1);
    expect(work.peakMonth).toBe(0);
    expect(work.lastDone).toBe("2026-01-05");
    expect(work.daysSinceLast).toBe(3); // Jan 5 → Jan 8
  });

  it("rolls up sleep on its own per-night axis", () => {
    expect(result.sleep).not.toBeNull();
    expect(result.sleep!.byMonth[0]).toBe(0.3); // 2 sleep hrs / 8 days = 0.25 → 0.3
    expect(result.sleep!.byWeekday[1]).toBe(2); // Tue: 2 hrs / 1 Tuesday
    expect(result.sleep!.avg).toBe(0.3); // 2 / 8
    expect(result.sleep!.bestMonth).toBe(0);
    expect(result.sleep!.worstMonth).toBe(0);
  });

  it("returns no activities for an entirely-future year", () => {
    const future = computeActivityYearInsights({ cellMap: new Map(), categoryMap: CATEGORY_MAP, year: 2027, now: NOW });
    expect(future.totalHours).toBe(0);
    expect(future.activities).toEqual([]);
    expect(future.sleep).toBeNull();
  });

  it("handles an empty year", () => {
    const empty = computeActivityYearInsights({ cellMap: new Map(), categoryMap: CATEGORY_MAP, year: 2026, now: NOW });
    expect(empty.totalHours).toBe(0);
    expect(empty.activities).toEqual([]);
    expect(empty.sleep).toBeNull();
    expect(empty.monthlyTotals).toEqual(new Array(12).fill(0));
  });
});

describe("computeActivityYearInsights — drill-down across months", () => {
  // "Now" mid-March: Jan (31) + Feb (28) + Mar 1–15 = 74 elapsed days.
  const NOW_MAR = new Date("2026-03-15T12:00:00Z");
  const CATS: Record<string, ActivityCategory> = { Run: "productive", Sleep: "sleep" };
  const cellMap = new Map<string, ActivityCell>();
  fillDay(cellMap, "2026-01-10", "lime", "Run", 2);
  fillDay(cellMap, "2026-02-05", "lime", "Run", 1);
  fillDay(cellMap, "2026-02-06", "lime", "Run", 1); // consecutive with Feb 5 → streak 2
  fillDay(cellMap, "2026-03-01", "lime", "Run", 3); // peak month
  fillDay(cellMap, "2026-01-20", "indigo", "Sleep", 3);
  fillDay(cellMap, "2026-02-10", "indigo", "Sleep", 6);
  fillDay(cellMap, "2026-03-05", "indigo", "Sleep", 9);
  const result = computeActivityYearInsights({ cellMap, categoryMap: CATS, year: 2026, now: NOW_MAR });

  it("aggregates monthly totals across the year", () => {
    expect(result.totalHours).toBe(25); // Run 7 + Sleep 18
    expect(result.monthlyTotals.slice(0, 3)).toEqual([5, 8, 12]); // Jan 2+3, Feb 2+6, Mar 3+9
  });

  it("builds each activity's monthly trend, peak, streak and recency", () => {
    const run = result.activities.find((a) => a.name === "Run")!;
    expect(run.monthly.slice(0, 3)).toEqual([2, 2, 3]);
    expect(run.peakMonth).toBe(2); // March
    expect(run.hours).toBe(7);
    expect(run.activeDays).toBe(4);
    expect(run.avgPerActiveDay).toBe(1.8); // 7 / 4
    expect(run.longestStreak).toBe(2); // Feb 5–6
    expect(run.lastDone).toBe("2026-03-01");
    expect(run.daysSinceLast).toBe(14); // Mar 1 → Mar 15
    expect(Math.round(run.percentage)).toBe(28); // 7 / 25
  });

  it("rolls sleep per night by month with best/worst and average", () => {
    const s = result.sleep!;
    expect(s.byMonth.slice(0, 3)).toEqual([0.1, 0.2, 0.6]); // 3/31, 6/28, 9/15
    expect(s.bestMonth).toBe(2); // March
    expect(s.worstMonth).toBe(0); // January
    expect(s.avg).toBe(0.2); // 18 / 74
  });
});

describe("computeMoodYearInsights — averages, rhythm, future exclusion", () => {
  const ratingMap = new Map<string, number>([
    ["2026-01-05", 5], // Mon
    ["2026-01-06", 4], // Tue
    ["2026-01-07", 2], // Wed
    ["2026-01-09", 5], // future → excluded
  ]);
  const now = new Date("2026-01-08T12:00:00"); // local
  const result = computeMoodYearInsights({ ratingMap, moods: MOODS, year: 2026, now });

  it("excludes future ratings and averages the rest", () => {
    expect(result.daysRated).toBe(3);
    expect(result.avgMood).toBe(3.7); // (5+4+2)/3
    expect(result.elapsedDays).toBe(8);
    expect(result.ratedPct).toBe(38); // 3/8 → 37.5 → 38
  });

  it("rolls up monthly and weekday averages", () => {
    expect(result.monthlyAvg[0]).toBe(3.7);
    expect(result.monthlyAvg[1]).toBeNull();
    expect(result.weekdayAvg.slice(0, 3)).toEqual([5, 4, 2]); // Mon, Tue, Wed
    expect(result.weekdayAvg[3]).toBeNull();
  });

  it("builds per-mood details, ranked by days", () => {
    const great = result.moods.find((m) => m.value === 5)!;
    expect(great.count).toBe(1);
    expect(Math.round(great.percentage)).toBe(33); // 1 / 3
    expect(great.weekday[0]).toBe(1); // Mon
    expect(great.monthly[0]).toBe(1);
    expect(great.peakMonth).toBe(0);
    expect(great.longestStreak).toBe(1);
    expect(great.lastFelt).toBe("2026-01-05");
    expect(great.daysSinceLast).toBe(3); // Jan 5 → Jan 8

    const unrated = result.moods.find((m) => m.value === 3)!;
    expect(unrated.count).toBe(0);
    expect(unrated.longestStreak).toBe(0);
    expect(unrated.lastFelt).toBeNull();
    expect(unrated.daysSinceLast).toBeNull();
  });

  it("summarises the weekly rhythm", () => {
    expect(result.rhythm.bestWeekday).toBe(0); // Mon (5)
    expect(result.rhythm.worstWeekday).toBe(2); // Wed (2)
    expect(result.rhythm.weekendAvg).toBeNull(); // no weekend ratings
    expect(result.rhythm.weekdayAvg).toBe(3.7); // Mon–Fri avg
  });

  it("handles a year with no ratings", () => {
    const empty = computeMoodYearInsights({ ratingMap: new Map(), moods: MOODS, year: 2026, now });
    expect(empty.daysRated).toBe(0);
    expect(empty.avgMood).toBe(0);
    expect(empty.monthlyAvg.every((m) => m === null)).toBe(true);
    expect(empty.moods.every((m) => m.count === 0)).toBe(true);
  });
});

describe("computeMoodYearInsights — per-mood drill-down across months", () => {
  const NOW_MAR = new Date("2026-03-15T12:00:00"); // local; Jan+Feb+Mar 1–15
  const ratingMap = new Map<string, number>([
    ["2026-01-10", 4],
    ["2026-01-11", 4],
    ["2026-01-12", 4], // Jan 10–12 consecutive → streak 3
    ["2026-01-20", 2],
    ["2026-02-05", 4],
    ["2026-02-06", 4],
    ["2026-03-01", 4],
    ["2026-03-02", 4],
  ]);
  const result = computeMoodYearInsights({ ratingMap, moods: MOODS, year: 2026, now: NOW_MAR });

  it("aggregates a mood's monthly trend, peak, streak and recency", () => {
    const good = result.moods.find((m) => m.value === 4)!;
    expect(good.count).toBe(7);
    expect(good.monthly.slice(0, 3)).toEqual([3, 2, 2]);
    expect(good.peakMonth).toBe(0); // January (most days)
    expect(good.longestStreak).toBe(3); // Jan 10–12
    expect(good.lastFelt).toBe("2026-03-02");
    expect(good.daysSinceLast).toBe(13); // Mar 2 → Mar 15
    expect(Math.round(good.percentage)).toBe(88); // 7 / 8
  });
});
