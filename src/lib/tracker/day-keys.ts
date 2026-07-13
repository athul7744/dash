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
