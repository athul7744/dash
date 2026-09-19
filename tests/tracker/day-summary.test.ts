/// <reference types="vitest/globals" />

/**
 * The per-day rollup behind both year grids' popovers and the Day surface.
 *
 * Each of those had grown its own copy; what they share is that one filled cell
 * means one hour, and that a reader wants the busiest activity first.
 */

import { summarizeDay, type DayCell } from "@/lib/tracker/day-summary";
import { hourCellKey } from "@/lib/tracker/day-keys";

const DAY = "2026-07-13";

/** A lookup over `{ hour: activity }`, coloured per activity. */
function cells(hours: Record<number, string>, hex: Record<string, string> = {}) {
  const byKey = new Map<string, DayCell>();
  for (const [hour, activity] of Object.entries(hours)) {
    byKey.set(hourCellKey(DAY, Number(hour)), { activity, hex: hex[activity] ?? "#6b7280" });
  }
  return (key: string) => byKey.get(key);
}

describe("summarizeDay", () => {
  it("counts one hour per filled cell", () => {
    const summary = summarizeDay(DAY, cells({ 9: "Work", 10: "Work", 11: "Reading" }));

    expect(summary.totalHours).toBe(3);
    expect(summary.activities).toEqual([
      { name: "Work", count: 2, hex: "#6b7280" },
      { name: "Reading", count: 1, hex: "#6b7280" },
    ]);
  });

  it("puts the busiest activity first, and ties in name order", () => {
    const summary = summarizeDay(DAY, cells({ 1: "Sleep", 2: "Sleep", 9: "Work", 10: "Work", 14: "Admin" }));
    expect(summary.activities.map((activity) => activity.name)).toEqual(["Sleep", "Work", "Admin"]);
  });

  it("keeps each activity's colour", () => {
    const summary = summarizeDay(DAY, cells({ 9: "Work" }, { Work: "#14b8a6" }));
    expect(summary.activities[0].hex).toBe("#14b8a6");
  });

  it("reads an untracked day as empty rather than missing", () => {
    const summary = summarizeDay(DAY, () => undefined);
    expect(summary).toEqual({ dateKey: DAY, totalHours: 0, activities: [] });
  });

  it("looks only at the day it was asked for", () => {
    // The lookup covers a whole week in the year grids, so a summary that
    // wandered outside its own 24 hours would double-count.
    const other = new Map([[hourCellKey("2026-07-14", 9), { activity: "Work", hex: "#000" }]]);
    const summary = summarizeDay(DAY, (key) => other.get(key));
    expect(summary.totalHours).toBe(0);
  });
});
