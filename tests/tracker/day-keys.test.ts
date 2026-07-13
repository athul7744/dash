import { describe, expect, it } from "vitest";

import { localDateKey, recentNaiveWindow, utcDateKey, utcDayBounds } from "@/lib/tracker/day-keys";

describe("tracker day keys", () => {
  it("utcDateKey returns the UTC calendar date, matching time_logs keying", () => {
    const date = new Date("2026-07-13T23:30:00.000Z");
    expect(utcDateKey(date)).toBe("2026-07-13");
    expect(utcDateKey(date)).toBe(date.toISOString().slice(0, 10));
  });

  it("localDateKey returns a yyyy-MM-dd string (local), matching daily_ratings", () => {
    expect(localDateKey(new Date(2026, 6, 13, 8, 0, 0))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(localDateKey(new Date(2026, 6, 13, 8, 0, 0))).toBe("2026-07-13");
  });

  it("utcDayBounds wraps a key into inclusive UTC-naive bounds", () => {
    expect(utcDayBounds("2026-07-13")).toEqual([
      "2026-07-13T00:00:00+00:00",
      "2026-07-13T23:59:59+00:00",
    ]);
  });

  it("recentNaiveWindow spans hoursBack hours, encoded in UTC-naive space", () => {
    const [start, end] = recentNaiveWindow(new Date(2026, 6, 13, 14, 30, 0), 2);
    expect(end).toBe("2026-07-13T14:30:00.000Z");
    expect(start).toBe("2026-07-13T12:30:00.000Z");
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("recentNaiveWindow crosses midnight correctly", () => {
    const [start, end] = recentNaiveWindow(new Date(2026, 6, 13, 0, 30, 0), 2);
    expect(end).toBe("2026-07-13T00:30:00.000Z");
    expect(start).toBe("2026-07-12T22:30:00.000Z");
  });
});
