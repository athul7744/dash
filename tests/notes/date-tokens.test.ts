/// <reference types="vitest/globals" />

import { formatDateToken, getRelativeDate } from "@/lib/notes/date-tokens";

describe("formatDateToken", () => {
  it("formats a date as {MMM d, yyyy}", () => {
    expect(formatDateToken(new Date(2026, 0, 15))).toBe("{Jan 15, 2026}");
    expect(formatDateToken(new Date(2026, 11, 1))).toBe("{Dec 1, 2026}");
  });

  it("uses the day without leading zero", () => {
    expect(formatDateToken(new Date(2026, 5, 3))).toBe("{Jun 3, 2026}");
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
