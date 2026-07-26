/// <reference types="vitest/globals" />

import {
  dueOccurrence,
  formatSchedule,
  nextOccurrenceOnOrAfter,
  occurrenceKey,
  type EventSchedule,
} from "@/lib/events/schedule";

/** Local-midnight date, so tests read in the same calendar the engine uses. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("nextOccurrenceOnOrAfter", () => {
  it("returns a future one-off date, and null once it's past", () => {
    const s: EventSchedule = { freq: "once", date: "2026-08-03" };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(s, day(2026, 7, 1))!)).toBe("2026-08-03");
    expect(occurrenceKey(nextOccurrenceOnOrAfter(s, day(2026, 8, 3))!)).toBe("2026-08-03");
    expect(nextOccurrenceOnOrAfter(s, day(2026, 8, 4))).toBeNull();
  });

  it("finds the next weekday for a weekly schedule", () => {
    const monday: EventSchedule = { freq: "weekly", weekday: 1 };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(monday, day(2026, 7, 20))!)).toBe("2026-07-20");
    expect(occurrenceKey(nextOccurrenceOnOrAfter(monday, day(2026, 7, 21))!)).toBe("2026-07-27");
  });

  it("finds this month or rolls to next for a monthly schedule", () => {
    const fifteenth: EventSchedule = { freq: "monthly", day: 15 };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(fifteenth, day(2026, 7, 10))!)).toBe("2026-07-15");
    expect(occurrenceKey(nextOccurrenceOnOrAfter(fifteenth, day(2026, 7, 20))!)).toBe("2026-08-15");
  });

  it("clamps a monthly day past the month length", () => {
    const last: EventSchedule = { freq: "monthly", day: 31 };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(last, day(2026, 2, 1))!)).toBe("2026-02-28");
  });

  it("finds this year or rolls to next for a yearly schedule", () => {
    const jul20: EventSchedule = { freq: "yearly", month: 6, day: 20 };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(jul20, day(2026, 1, 1))!)).toBe("2026-07-20");
    expect(occurrenceKey(nextOccurrenceOnOrAfter(jul20, day(2026, 8, 1))!)).toBe("2027-07-20");
  });

  it("clamps a yearly Feb 29 to Feb 28 in a non-leap year", () => {
    const leapDay: EventSchedule = { freq: "yearly", month: 1, day: 29 };
    expect(occurrenceKey(nextOccurrenceOnOrAfter(leapDay, day(2026, 1, 1))!)).toBe("2026-02-28");
  });

  it("anchors an interval schedule to the last occurrence (or now when never done)", () => {
    const every3: EventSchedule = { freq: "interval", days: 3 };
    // Never done → due now (the `from` day).
    expect(occurrenceKey(nextOccurrenceOnOrAfter(every3, day(2026, 7, 10))!)).toBe("2026-07-10");
    // Last done on the 8th → next due the 11th.
    expect(occurrenceKey(nextOccurrenceOnOrAfter(every3, day(2026, 7, 10), day(2026, 7, 8))!)).toBe("2026-07-11");
  });
});

describe("formatSchedule", () => {
  it("summarizes each frequency", () => {
    expect(formatSchedule({ freq: "once", date: "2026-08-03" })).toBe("On Aug 3, 2026");
    expect(formatSchedule({ freq: "weekly", weekday: 1 })).toBe("Every Monday");
    expect(formatSchedule({ freq: "monthly", day: 1 })).toBe("Monthly on the 1st");
    expect(formatSchedule({ freq: "monthly", day: 22 })).toBe("Monthly on the 22nd");
    expect(formatSchedule({ freq: "yearly", month: 6, day: 20 })).toBe("Yearly on Jul 20");
    expect(formatSchedule({ freq: "interval", days: 1 })).toBe("Every day");
    expect(formatSchedule({ freq: "interval", days: 3 })).toBe("Every 3 days");
  });
});

describe("dueOccurrence", () => {
  const schedule: EventSchedule = { freq: "monthly", day: 15 };

  it("fires once inside the lead window", () => {
    const r = { schedule, daysBefore: 3, lastMaterializedKey: null };
    expect(dueOccurrence(r, day(2026, 7, 11))).toBeNull();
    const due = dueOccurrence(r, day(2026, 7, 12));
    expect(due?.key).toBe("2026-07-15");
  });

  it("suppresses an occurrence already materialized", () => {
    const r = { schedule, daysBefore: 3, lastMaterializedKey: "2026-07-15" };
    expect(dueOccurrence(r, day(2026, 7, 14))).toBeNull();
  });

  it("advances to the next occurrence once today passes the last one", () => {
    const r = { schedule, daysBefore: 3, lastMaterializedKey: "2026-07-15" };
    const due = dueOccurrence(r, day(2026, 8, 13));
    expect(due?.key).toBe("2026-08-15");
  });

  it("fires an interval schedule once its gap since last occurrence elapses", () => {
    const r = { schedule: { freq: "interval" as const, days: 3 }, daysBefore: 0, lastMaterializedKey: null, lastOccurrence: day(2026, 7, 10) };
    expect(dueOccurrence(r, day(2026, 7, 12))).toBeNull(); // due the 13th, no lead
    expect(dueOccurrence(r, day(2026, 7, 13))?.key).toBe("2026-07-13");
  });
});
