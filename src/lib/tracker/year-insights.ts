/**
 * Pure, DB-free rollups for the tracker's year views (Activity + Mood).
 *
 * Kept free of PowerSync/React so it unit-tests like `schedule.ts`/`actions.ts`.
 * The grids build the raw maps from their queries and hand them here; the
 * presentational widgets in `year-insights.tsx` render what these return.
 *
 * Both rollups exclude the future — a year holding backfilled logs/ratings must
 * not inflate any figure. Activity cells are keyed in UTC (see `YearActivityGrid`
 * `cellMap`); mood ratings are keyed by the LOCAL calendar date — so each gates
 * on its own "now".
 */

import { COLOR_HEX } from "@/components/tracker/widgets/types";
import { DEFAULT_ACTIVITY_CATEGORY, type ActivityCategory } from "@/lib/tracker/activities";
import { moodHex, type Mood } from "@/lib/tracker/moods";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const YEAR_INSIGHTS_WEEKDAYS = WEEKDAY_LABELS;
export const YEAR_INSIGHTS_MONTHS = MONTH_LABELS;

/** A logged hour-cell (the value shape of `YearActivityGrid`'s `cellMap`). */
export type ActivityCell = { color: string; activity: string };

/** One activity's year, ready to drill into (charts + cadence + recency). */
export type ActivityDetail = {
  name: string;
  hex: string;
  hours: number;
  /** Share of all logged hours, 0–100. */
  percentage: number;
  /** Total hours per calendar month, Jan–Dec. */
  monthly: number[];
  /** Average hours per elapsed weekday, Mon-first. */
  weekday: number[];
  /** Distinct calendar days this activity was logged. */
  activeDays: number;
  avgPerActiveDay: number;
  /** Longest run of consecutive days this activity was logged. */
  longestStreak: number;
  /** Index of the busiest month (argmax of `monthly`). */
  peakMonth: number;
  /** Latest day logged, `yyyy-MM-dd`, or null when never. */
  lastDone: string | null;
  /** Whole days between `lastDone` and now, or null when never. */
  daysSinceLast: number | null;
};

/** Sleep rolled up on its own axis — avg hours per night. */
export type SleepInsights = {
  /** Avg hours per night per calendar month, Jan–Dec (0 where no data). */
  byMonth: number[];
  /** Avg hours per night per weekday, Mon-first. */
  byWeekday: number[];
  /** Avg hours per night across the year. */
  avg: number;
  /** Month index with the most / least sleep, among months with data. */
  bestMonth: number;
  worstMonth: number;
};

export type ActivityYearInsights = {
  totalHours: number;
  /** Total logged hours per calendar month, Jan–Dec. */
  monthlyTotals: number[];
  /** Every activity, most hours first — each drillable. */
  activities: ActivityDetail[];
  /** Sleep rollup, or null when no sleep was logged. */
  sleep: SleepInsights | null;
};

/** One mood level's year, ready to drill into (charts + cadence + recency). */
export type MoodLevelDetail = {
  value: number;
  label: string;
  color: string;
  hex: string;
  /** Days spent at this mood level. */
  count: number;
  /** Share of rated days, 0–100. */
  percentage: number;
  /** Days at this mood per calendar month, Jan–Dec. */
  monthly: number[];
  /** Days at this mood per weekday, Mon-first. */
  weekday: number[];
  /** Longest run of consecutive days at this mood. */
  longestStreak: number;
  /** Month index this mood shows up most (argmax of `monthly`). */
  peakMonth: number;
  /** Latest day felt, `yyyy-MM-dd`, or null when never. */
  lastFelt: string | null;
  /** Whole days between `lastFelt` and now, or null when never. */
  daysSinceLast: number | null;
};

export type MoodYearInsights = {
  daysRated: number;
  avgMood: number;
  ratedPct: number;
  elapsedDays: number;
  /** Average mood score per month (null when no ratings that month). */
  monthlyAvg: (number | null)[];
  /** Average mood score per weekday, Mon-first (null when none). */
  weekdayAvg: (number | null)[];
  /** Every mood level, most days first — each drillable. */
  moods: MoodLevelDetail[];
  /** Weekly rhythm summary of average mood. */
  rhythm: { bestWeekday: number; worstWeekday: number; weekendAvg: number | null; weekdayAvg: number | null };
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Weekday index with Monday = 0, from a `yyyy-MM-dd` key (UTC-parsed, TZ-safe). */
function weekdayIndex(y: number, m1: number, d: number): number {
  return (new Date(Date.UTC(y, m1 - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Count elapsed calendar days in `year` (up to `elapsedEnd`, inclusive) and
 * tally them per month and per weekday — the denominators for per-night /
 * per-weekday averages. Stepping by whole UTC days is DST-safe.
 */
function elapsedDayTallies(year: number, elapsedEnd: Date | null) {
  const perMonth = new Array<number>(12).fill(0);
  const perWeekday = new Array<number>(7).fill(0);
  let total = 0;
  if (!elapsedEnd) return { perMonth, perWeekday, total };
  const start = Date.UTC(year, 0, 1);
  const end = elapsedEnd.getTime();
  for (let t = start; t <= end; t += DAY_MS) {
    const d = new Date(t);
    perMonth[d.getUTCMonth()] += 1;
    perWeekday[(d.getUTCDay() + 6) % 7] += 1;
    total += 1;
  }
  return { perMonth, perWeekday, total };
}

export function computeActivityYearInsights({
  cellMap,
  categoryMap,
  year,
  now,
}: {
  cellMap: Map<string, ActivityCell>;
  categoryMap: Record<string, ActivityCategory>;
  year: number;
  now: Date;
}): ActivityYearInsights {
  const nowDate = now.toISOString().slice(0, 10);
  const nowHour = now.getUTCHours();
  const nowYear = Number(nowDate.slice(0, 4));
  const isElapsed = (dateKey: string, hour: number) =>
    dateKey < nowDate || (dateKey === nowDate && hour <= nowHour);

  // Per-activity raw tallies; derived stats are computed after the pass.
  type Acc = {
    hex: string;
    hours: number;
    monthly: number[];
    weekdayHours: number[];
    days: Set<string>;
    lastDone: string | null;
  };
  const perActivity = new Map<string, Acc>();
  const monthlyTotals = new Array<number>(12).fill(0);
  const sleepByMonthHours = new Array<number>(12).fill(0);
  const sleepByWeekdayHours = new Array<number>(7).fill(0);
  let sleepTotalHours = 0;
  let totalHours = 0;

  for (const [key, cell] of cellMap) {
    const [dateKey, hh] = key.split("|");
    if (!isElapsed(dateKey, Number(hh))) continue;
    totalHours += 1;

    const [y, m, d] = dateKey.split("-").map(Number);
    const monthIdx = m - 1;
    const wd = weekdayIndex(y, m, d);
    monthlyTotals[monthIdx] += 1;

    const cat = categoryMap[cell.activity] ?? DEFAULT_ACTIVITY_CATEGORY;
    if (cat === "sleep") {
      sleepByMonthHours[monthIdx] += 1;
      sleepByWeekdayHours[wd] += 1;
      sleepTotalHours += 1;
    }

    let acc = perActivity.get(cell.activity);
    if (!acc) {
      acc = { hex: COLOR_HEX[cell.color] || "#6b7280", hours: 0, monthly: new Array<number>(12).fill(0), weekdayHours: new Array<number>(7).fill(0), days: new Set(), lastDone: null };
      perActivity.set(cell.activity, acc);
    }
    acc.hours += 1;
    acc.monthly[monthIdx] += 1;
    acc.weekdayHours[wd] += 1;
    acc.days.add(dateKey);
    if (acc.lastDone === null || dateKey > acc.lastDone) acc.lastDone = dateKey;
  }

  const elapsedEnd = year > nowYear ? null : year < nowYear ? new Date(Date.UTC(year, 11, 31)) : new Date(`${nowDate}T00:00:00Z`);
  const tallies = elapsedDayTallies(year, elapsedEnd);

  const activities: ActivityDetail[] = Array.from(perActivity.entries())
    .map(([name, acc]) => {
      const activeDays = acc.days.size;
      let peakMonth = 0;
      for (let i = 1; i < 12; i += 1) if (acc.monthly[i] > acc.monthly[peakMonth]) peakMonth = i;
      return {
        name,
        hex: acc.hex,
        hours: acc.hours,
        percentage: totalHours ? (acc.hours / totalHours) * 100 : 0,
        monthly: acc.monthly,
        weekday: acc.weekdayHours.map((h, i) => (tallies.perWeekday[i] > 0 ? round1(h / tallies.perWeekday[i]) : 0)),
        activeDays,
        avgPerActiveDay: activeDays > 0 ? round1(acc.hours / activeDays) : 0,
        longestStreak: longestDayStreak(acc.days),
        peakMonth,
        lastDone: acc.lastDone,
        daysSinceLast: acc.lastDone ? daysBetween(acc.lastDone, nowDate) : null,
      };
    })
    .sort((a, b) => b.hours - a.hours);

  let sleep: SleepInsights | null = null;
  if (sleepTotalHours > 0) {
    const byMonth = sleepByMonthHours.map((h, i) => (tallies.perMonth[i] > 0 ? round1(h / tallies.perMonth[i]) : 0));
    const byWeekday = sleepByWeekdayHours.map((h, i) => (tallies.perWeekday[i] > 0 ? round1(h / tallies.perWeekday[i]) : 0));
    const withData = byMonth.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
    let best = withData[0];
    let worst = withData[0];
    for (const x of withData) {
      if (x.v > best.v) best = x;
      if (x.v < worst.v) worst = x;
    }
    sleep = {
      byMonth,
      byWeekday,
      avg: tallies.total > 0 ? round1(sleepTotalHours / tallies.total) : 0,
      bestMonth: best.i,
      worstMonth: worst.i,
    };
  }

  return { totalHours, monthlyTotals, activities, sleep };
}

/** Longest run of consecutive calendar days in a `yyyy-MM-dd` set. */
function longestDayStreak(days: Set<string>): number {
  const times = Array.from(days)
    .sort()
    .map((dk) => {
      const [y, m, d] = dk.split("-").map(Number);
      return Date.UTC(y, m - 1, d);
    });
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const t of times) {
    run = prev !== null && t - prev === DAY_MS ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = t;
  }
  return longest;
}

/** Whole days from `from` to `to`, both `yyyy-MM-dd` (UTC-parsed, TZ-safe). */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

export function computeMoodYearInsights({
  ratingMap,
  moods,
  year,
  now,
}: {
  ratingMap: Map<string, number>;
  moods: Mood[];
  year: number;
  now: Date;
}): MoodYearInsights {
  // Ratings key on the LOCAL calendar date, so gate on local "today".
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowLocal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const yearStr = String(year);

  const monthSum = new Array<number>(12).fill(0);
  const monthCount = new Array<number>(12).fill(0);
  const weekdaySum = new Array<number>(7).fill(0);
  const weekdayCount = new Array<number>(7).fill(0);
  // Per-mood-level tallies; derived stats computed after the pass.
  type MoodAcc = { count: number; monthly: number[]; weekday: number[]; days: Set<string>; lastFelt: string | null };
  const perMood = new Map<number, MoodAcc>();
  let sum = 0;
  let daysRated = 0;

  const entries = Array.from(ratingMap.entries())
    .filter(([dk]) => dk.slice(0, 4) === yearStr && dk <= nowLocal)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  for (const [dk, score] of entries) {
    const [y, m, d] = dk.split("-").map(Number);
    const monthIdx = m - 1;
    const w = weekdayIndex(y, m, d);
    daysRated += 1;
    sum += score;
    monthSum[monthIdx] += score;
    monthCount[monthIdx] += 1;
    weekdaySum[w] += score;
    weekdayCount[w] += 1;

    let acc = perMood.get(score);
    if (!acc) {
      acc = { count: 0, monthly: new Array<number>(12).fill(0), weekday: new Array<number>(7).fill(0), days: new Set(), lastFelt: null };
      perMood.set(score, acc);
    }
    acc.count += 1;
    acc.monthly[monthIdx] += 1;
    acc.weekday[w] += 1;
    acc.days.add(dk);
    if (acc.lastFelt === null || dk > acc.lastFelt) acc.lastFelt = dk;
  }

  const moodDetails: MoodLevelDetail[] = [...moods]
    .map((mood) => {
      const acc = perMood.get(mood.value);
      const monthly = acc?.monthly ?? new Array<number>(12).fill(0);
      const weekday = acc?.weekday ?? new Array<number>(7).fill(0);
      let peakMonth = 0;
      for (let i = 1; i < 12; i += 1) if (monthly[i] > monthly[peakMonth]) peakMonth = i;
      const count = acc?.count ?? 0;
      const lastFelt = acc?.lastFelt ?? null;
      return {
        value: mood.value,
        label: mood.label,
        color: mood.color,
        hex: moodHex(mood),
        count,
        percentage: daysRated ? (count / daysRated) * 100 : 0,
        monthly,
        weekday,
        longestStreak: acc ? longestDayStreak(acc.days) : 0,
        peakMonth,
        lastFelt,
        daysSinceLast: lastFelt ? daysBetween(lastFelt, nowLocal) : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  const weekdayAvg = weekdaySum.map((s, i) => (weekdayCount[i] > 0 ? round1(s / weekdayCount[i]) : null));

  // Weekly rhythm summary: best/worst weekday + weekend vs weekday averages.
  let bestWeekday = 0;
  let worstWeekday = 0;
  const withWd = weekdayAvg.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  if (withWd.length) {
    let best = withWd[0];
    let worst = withWd[0];
    for (const x of withWd) {
      if (x.v > best.v) best = x;
      if (x.v < worst.v) worst = x;
    }
    bestWeekday = best.i;
    worstWeekday = worst.i;
  }
  const weekendCount = weekdayCount[5] + weekdayCount[6];
  const weekendAvg = weekendCount > 0 ? round1((weekdaySum[5] + weekdaySum[6]) / weekendCount) : null;
  let wdOnlyCount = 0;
  let wdOnlySum = 0;
  for (let i = 0; i < 5; i += 1) {
    wdOnlyCount += weekdayCount[i];
    wdOnlySum += weekdaySum[i];
  }
  const rhythmWeekdayAvg = wdOnlyCount > 0 ? round1(wdOnlySum / wdOnlyCount) : null;

  const nowYear = now.getFullYear();
  let elapsedDays: number;
  if (year > nowYear) elapsedDays = 0;
  else if (year < nowYear) elapsedDays = elapsedDayTallies(year, new Date(Date.UTC(year, 11, 31))).total;
  else elapsedDays = elapsedDayTallies(year, new Date(`${nowLocal}T00:00:00Z`)).total;

  return {
    daysRated,
    avgMood: daysRated > 0 ? round1(sum / daysRated) : 0,
    ratedPct: elapsedDays > 0 ? Math.round((daysRated / elapsedDays) * 100) : 0,
    elapsedDays,
    monthlyAvg: monthSum.map((s, i) => (monthCount[i] > 0 ? round1(s / monthCount[i]) : null)),
    weekdayAvg,
    moods: moodDetails,
    rhythm: { bestWeekday, worstWeekday, weekendAvg, weekdayAvg: rhythmWeekdayAvg },
  };
}
