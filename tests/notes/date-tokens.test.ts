/// <reference types="vitest/globals" />

import {
  formatDateLabel,
  formatDateToken,
  getRelativeDate,
  parseDateToken,
  parseDayQuery,
} from "@/lib/notes/date-tokens";
import { localDateKey } from "@/lib/tracker/day-keys";

describe("formatDateToken", () => {
  it("formats a date as {MMM d, yyyy}", () => {
    expect(formatDateToken(new Date(2026, 0, 15))).toBe("{Jan 15, 2026}");
    expect(formatDateToken(new Date(2026, 11, 1))).toBe("{Dec 1, 2026}");
  });

  it("uses the day without leading zero", () => {
    expect(formatDateToken(new Date(2026, 5, 3))).toBe("{Jun 3, 2026}");
  });
});

describe("parseDateToken", () => {
  it("parses a formatted date token", () => {
    const d = parseDateToken("Jan 15, 2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });

  it("rejects short strings so {2026} never becomes a chip", () => {
    expect(parseDateToken("2026")).toBeNull();
  });

  it("rejects non-dates", () => {
    expect(parseDateToken("not a date")).toBeNull();
  });
});

describe("getRelativeDate", () => {
  // Freeze "now" for deterministic tests
  const FIXED_NOW = new Date(2026, 4, 31, 12, 0, 0); // May 31, 2026

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's date for 'today'", () => {
    const d = getRelativeDate("today");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(31);
  });

  it("returns tomorrow's date for 'tomorrow'", () => {
    const d = getRelativeDate("tomorrow");
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(1);
  });

  it("returns yesterday's date for 'yesterday'", () => {
    const d = getRelativeDate("yesterday");
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(30);
  });

  it("returns a date 7 days ahead for 'next-week'", () => {
    const d = getRelativeDate("next-week");
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(7);
  });

  it("returns a date one month ahead for 'next-month'", () => {
    const d = getRelativeDate("next-month");
    // May 31 + 1 month → June 31 doesn't exist → JS rolls to July 1
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(1);
  });

  it("returns a date one year ahead for 'next-year'", () => {
    const d = getRelativeDate("next-year");
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(31);
  });

  it("handles month boundary for next-month on Jan 31", () => {
    vi.setSystemTime(new Date(2026, 0, 31, 12, 0, 0)); // Jan 31
    const d = getRelativeDate("next-month");
    // JS Date rolls Jan 31 + 1 month → March 3 (Feb has 28 days)
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(3);
  });
});

describe("a chip's label round-trips to a day key", () => {
  it("survives label → date → key", () => {
    // A date chip stores only what it displays, so opening the day it names
    // means parsing that label back. If this drifts, chips open the wrong day
    // (or nothing) with nothing else failing.
    for (const date of [new Date(2026, 0, 15), new Date(2026, 6, 23), new Date(2026, 11, 1)]) {
      const parsed = parseDateToken(formatDateLabel(date));
      expect(parsed).not.toBeNull();
      expect(localDateKey(parsed!)).toBe(localDateKey(date));
    }
  });

  it("gives back nothing for a label that isn't a date", () => {
    // The chip stays inert rather than routing somewhere arbitrary.
    expect(parseDateToken("someday")).toBeNull();
  });
});

describe("parseDayQuery", () => {
  it("reads a date with no year as this year", () => {
    // `new Date("sep 15")` lands in 2001, which would send someone typing a
    // date into the palette twenty-five years back.
    const parsed = parseDayQuery("sep 15");
    expect(parsed?.getFullYear()).toBe(new Date().getFullYear());
    expect(parsed?.getMonth()).toBe(8);
    expect(parsed?.getDate()).toBe(15);
  });

  it("keeps a year that was given", () => {
    expect(localDateKey(parseDayQuery("2026-09-15")!)).toBe("2026-09-15");
    expect(localDateKey(parseDayQuery("Sep 15, 2026")!)).toBe("2026-09-15");
  });

  it("reads the words people actually type", () => {
    expect(localDateKey(parseDayQuery("today")!)).toBe(localDateKey(new Date()));
    expect(localDateKey(parseDayQuery("Yesterday")!)).toBe(localDateKey(getRelativeDate("yesterday")));
  });

  it("refuses a bare number", () => {
    // Otherwise searching for "12" offers a day in December that nobody asked for.
    expect(parseDayQuery("12")).toBeNull();
    expect(parseDayQuery("2026")).toBeNull();
  });

  it("refuses text that isn't a date", () => {
    expect(parseDayQuery("meeting notes")).toBeNull();
    expect(parseDayQuery("")).toBeNull();
    expect(parseDayQuery("   ")).toBeNull();
  });
});
