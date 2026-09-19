import { format } from "date-fns";

/**
 * Date keys for the tracker's two differently-keyed stores.
 *
 * - `time_logs.start_timestamp` is UTC-naive (written/read ignoring the real
 *   timezone), so a day is keyed by the UTC calendar date.
 * - `daily_ratings.rating_date` is the LOCAL calendar date.
 *
 * Kept pure (caller passes the Date) for testability.
 */

/** UTC calendar date "yyyy-MM-dd" — for time_logs windows. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Local calendar date "yyyy-MM-dd" — for daily_ratings.rating_date. */
export function localDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Inclusive [start, end] UTC-naive bounds for a time_logs day window. */
export function utcDayBounds(dateKey: string): [string, string] {
  return [`${dateKey}T00:00:00+00:00`, `${dateKey}T23:59:59+00:00`];
}

/**
 * [start, end) real instants for a local calendar day — the bounds for every
 * store that timestamps a true moment: `tasks.due_date` / `completed_at`, an
 * occurrence's `$.at`, a bookmark's `$.addedAt`, `pages.created_at`.
 *
 * Not interchangeable with `utcDayBounds`, which serves the tracker's UTC-naive
 * timestamps. Using the wrong one moves everything near midnight to the
 * neighbouring day, by the size of the viewer's UTC offset. Half-open at the end
 * so an instant at the next local midnight belongs to the next day, not both.
 */
export function localDayBounds(dateKey: string): [string, string] {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return [start.toISOString(), end.toISOString()];
}

/**
 * [start, end] bounds (ISO) for the last `hoursBack` hours, encoded the way
 * time_logs are written — local wall-clock parts as UTC (see tracker write in
 * app/tracker/page.tsx) — so a rolling window matches stored cells and crosses
 * midnight correctly. Pure: pass the reference Date.
 */
export function recentNaiveWindow(now: Date, hoursBack = 2): [string, string] {
  const end = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
  const start = end - hoursBack * 60 * 60 * 1000;
  return [new Date(start).toISOString(), new Date(end).toISOString()];
}

/** The grid's cell key for one hour of a day: `yyyy-MM-dd|HH`. */
export function hourCellKey(dateKey: string, hour: number): string {
  return `${dateKey}|${String(hour).padStart(2, "0")}`;
}
