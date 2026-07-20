/// <reference types="vitest/globals" />

import {
  dueOccurrence,
  formatSchedule,
  nextOccurrenceOnOrAfter,
  occurrenceKey,
  type ReminderSchedule,
} from "@/lib/reminders/schedule";

/** Local-midnight date, so tests read in the same calendar the engine uses. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("nextOccurrenceOnOrAfter", () => {
  it("returns a future one-off date, and null once it's past", () => {
    const s: ReminderSchedule = { freq: "once", date: "2026-08-03" };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(s, day(2026, 7, 1))!)).toBe("2026-08-03");
    // On the day itself it still counts.
    expect(occurrenceKey(nextOccurrenceOnOrAfter(s, day(2026, 8, 3))!)).toBe("2026-08-03");
    // After it, there is no next occurrence.
    expect(nextOccurrenceOnOrAfter(s, day(2026, 8, 4))).toBeNull();
  });

  it("finds the next weekday for a weekly schedule", () => {
    const monday: ReminderSchedule = { freq: "weekly", weekday: 1 };
    // 2026-07-20 is a Monday → returns itself.
    expect(occurrenceKey(nextOccurrenceOnOrAfter(monday, day(2026, 7, 20))!)).toBe("2026-07-20");
    // Tuesday the 21st → next Monday is the 27th.
    expect(occurrenceKey(nextOccurrenceOnOrAfter(monday, day(2026, 7, 21))!)).toBe("2026-07-27");
  });

  it("finds this month or rolls to next for a monthly schedule", () => {
    const fifteenth: ReminderSchedule = { freq: "monthly", day: 15 };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(fifteenth, day(2026, 7, 10))!)).toBe("2026-07-15");
    expect(occurrenceKey(nextOccurrenceOnOrAfter(fifteenth, day(2026, 7, 20))!)).toBe("2026-08-15");
  });

  it("clamps a monthly day past the month length", () => {
    const last: ReminderSchedule = { freq: "monthly", day: 31 };
    // Feb 2026 has 28 days.
    expect(occurrenceKey(nextOccurrenceOnOrAfter(last, day(2026, 2, 1))!)).toBe("2026-02-28");
  });

  it("finds this year or rolls to next for a yearly schedule", () => {
    const jul20: ReminderSchedule = { freq: "yearly", month: 6, day: 20 };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(jul20, day(2026, 1, 1))!)).toBe("2026-07-20");
    expect(occurrenceKey(nextOccurrenceOnOrAfter(jul20, day(2026, 8, 1))!)).toBe("2027-07-20");
  });

  it("clamps a yearly Feb 29 to Feb 28 in a non-leap year", () => {
    const leapDay: ReminderSchedule = { freq: "yearly", month: 1, day: 29 };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(leapDay, day(2026, 1, 1))!)).toBe("2026-02-28");
  });
});

describe("formatSchedule", () => {
  it("summarizes each frequency", () => {
    expect(formatSchedule({ freq: "once", date: "2026-08-03" })).toBe("On Aug 3, 2026");
    expect(formatSchedule({ freq: "weekly", weekday: 1 })).toBe("Every Monday");
    expect(formatSchedule({ freq: "monthly", day: 1 })).toBe("Monthly on the 1st");
    expect(formatSchedule({ freq: "monthly", day: 22 })).toBe("Monthly on the 22nd");
    expect(formatSchedule({ freq: "yearly", month: 6, day: 20 })).toBe("Yearly on Jul 20");
  });
});

describe("dueOccurrence", () => {
  const schedule: ReminderSchedule = { freq: "monthly", day: 15 };

  it("fires once inside the lead window", () => {
    // Occurrence is the 15th, lead 3 days → fires from the 12th.
    const r = { schedule, daysBefore: 3, lastMaterializedKey: null };
    expect(dueOccurrence(r, day(2026, 7, 11))).toBeNull(); // outside window
    const due = dueOccurrence(r, day(2026, 7, 12));
    expect(due?.key).toBe("2026-07-15");
  });

  it("suppresses an occurrence already materialized", () => {
    const r = { schedule, daysBefore: 3, lastMaterializedKey: "2026-07-15" };
    expect(dueOccurrence(r, day(2026, 7, 14))).toBeNull();
  });

  it("advances to the next occurrence once today passes the last one", () => {
    const r = { schedule, daysBefore: 3, lastMaterializedKey: "2026-07-15" };
    // Now in August: next occurrence is Aug 15, a different key → fires in its window.
    const due = dueOccurrence(r, day(2026, 8, 13));
    expect(due?.key).toBe("2026-08-15");
  });
});
