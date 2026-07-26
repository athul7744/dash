/**
 * Event recurrence — pure, DB-free (like `src/lib/shared/capture.ts`) so the
 * test suite can exercise it without loading PowerSync. Calendar cases advance
 * in the LOCAL calendar (matching `dayNumber` in `daily-pick.ts`); the
 * `interval` case is relative to the last logged occurrence, so "every N days"
 * self-corrects to when the thing actually happened.
 */
import { addDays, format } from "date-fns";

import { dayNumber } from "@/lib/shared/daily-pick";

export type EventSchedule =
  | { freq: "once"; date: string } //             yyyy-MM-dd
  | { freq: "weekly"; weekday: number } //         0=Sun … 6=Sat
  | { freq: "monthly"; day: number } //            1–31, clamped to month length
  | { freq: "yearly"; month: number; day: number } // month 0–11, day 1–31 (clamped)
  | { freq: "interval"; days: number }; //         every N days, relative to last occurrence

/** Just the fields the due-check needs — keeps this module free of the DB-bound type. */
export interface DueInput {
  schedule: EventSchedule;
  daysBefore: number;
  lastMaterializedKey: string | null;
  /** Last logged occurrence — the anchor for an `interval` schedule. */
  lastOccurrence?: Date | null;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Midnight of a date's local calendar day. */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Days in a given local month (monthIndex 0–11). */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** `yyyy-MM-dd` for a date's local day — the per-occurrence idempotency token. */
export function occurrenceKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * The next occurrence date for a schedule. For the calendar cases it's the first
 * occurrence on or after `from`; for `interval` it's `lastOccurrence + N days`
 * (or `from` when never logged), which may be in the PAST when overdue — the
 * caller's due-window check handles that. Month/year days that overflow the
 * target month are clamped. `once` returns null when already past.
 */
export function nextOccurrenceOnOrAfter(schedule: EventSchedule, from: Date, lastOccurrence?: Date | null): Date | null {
  const base = startOfLocalDay(from);

  switch (schedule.freq) {
    case "once": {
      const [y, m, d] = schedule.date.split("-").map(Number);
      const target = new Date(y, m - 1, d);
      return target.getTime() >= base.getTime() ? target : null;
    }
    case "weekly": {
      const diff = (schedule.weekday - base.getDay() + 7) % 7;
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff);
    }
    case "monthly": {
      let year = base.getFullYear();
      let month = base.getMonth();
      for (let i = 0; i < 4; i++) {
        const day = Math.min(schedule.day, daysInMonth(year, month));
        const candidate = new Date(year, month, day);
        if (candidate.getTime() >= base.getTime()) return candidate;
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }
      return null;
    }
    case "yearly": {
      let year = base.getFullYear();
      for (let i = 0; i < 2; i++) {
        const day = Math.min(schedule.day, daysInMonth(year, schedule.month));
        const candidate = new Date(year, schedule.month, day);
        if (candidate.getTime() >= base.getTime()) return candidate;
        year += 1;
      }
      return null;
    }
    case "interval": {
      const days = Math.max(1, Math.floor(schedule.days));
      if (!lastOccurrence) return base; // never done → due now
      return addDays(startOfLocalDay(lastOccurrence), days);
    }
  }
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** A short human summary of a schedule, e.g. "Every Monday", "Every 3 days". */
export function formatSchedule(schedule: EventSchedule): string {
  switch (schedule.freq) {
    case "once": {
      const [y, m, d] = schedule.date.split("-").map(Number);
      return `On ${format(new Date(y, m - 1, d), "PP")}`;
    }
    case "weekly":
      return `Every ${WEEKDAY_NAMES[schedule.weekday] ?? "day"}`;
    case "monthly":
      return `Monthly on the ${ordinal(schedule.day)}`;
    case "yearly":
      return `Yearly on ${format(new Date(2000, schedule.month, schedule.day), "MMM d")}`;
    case "interval":
      return schedule.days === 1 ? "Every day" : `Every ${schedule.days} days`;
  }
}

/**
 * A compact, plain-English line describing exactly what a schedule does — the
 * shared summary shown on the card and the detail page's schedule strip. `next`
 * is the caller-computed next occurrence (may be null).
 */
export function describeSchedule(input: { schedule: EventSchedule | null; daysBefore: number; active: boolean }, next: Date | null): string {
  const { schedule, daysBefore, active } = input;
  if (!schedule) return "No schedule — logged whenever it happens.";
  const base = formatSchedule(schedule);
  if (!active) return `Paused · ${base}. No tasks being created.`;
  const lead = daysBefore === 0 ? "on the day it's due" : `${daysBefore} day${daysBefore === 1 ? "" : "s"} before it's due`;
  const nextTxt = next ? ` Next ${format(next, "PP")}.` : "";
  return `${base} — task appears ${lead}.${nextTxt}`;
}

/**
 * Decide whether a schedule's next occurrence should be materialized today.
 * Returns the occurrence + its key when `today` is within the lead window and
 * that occurrence hasn't been materialized yet; otherwise null. The pending-gate
 * (is the previous task still open?) is applied by the materializer, not here.
 */
export function dueOccurrence(input: DueInput, today: Date): { occurrence: Date; key: string } | null {
  const occurrence = nextOccurrenceOnOrAfter(input.schedule, today, input.lastOccurrence);
  if (!occurrence) return null;
  const key = occurrenceKey(occurrence);
  if (key === input.lastMaterializedKey) return null;
  if (dayNumber(today) >= dayNumber(occurrence) - input.daysBefore) {
    return { occurrence, key };
  }
  return null;
}
