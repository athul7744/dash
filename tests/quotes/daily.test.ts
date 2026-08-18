import { describe, expect, it } from "vitest";

import { dayNumber, pickDailyQuote } from "@/lib/quotes/daily";
import type { Quote } from "@/lib/quotes/quotes";

function quote(id: string, favorite = false): Quote {
  return { id, text: `q-${id}`, author: "", link: "", favorite, sortRank: id };
}

describe("pickDailyQuote", () => {
  it("returns null for an empty collection", () => {
    expect(pickDailyQuote([], new Date(2026, 6, 19))).toBeNull();
  });

  it("returns the only quote regardless of date", () => {
    const only = [quote("a")];
    expect(pickDailyQuote(only, new Date(2026, 0, 1))?.id).toBe("a");
    expect(pickDailyQuote(only, new Date(2026, 6, 19))?.id).toBe("a");
  });

  it("is deterministic for a given local day (stable within the day)", () => {
    const quotes = [quote("a"), quote("b"), quote("c"), quote("d")];
    const morning = pickDailyQuote(quotes, new Date(2026, 6, 19, 8, 0, 0));
    const evening = pickDailyQuote(quotes, new Date(2026, 6, 19, 23, 30, 0));
    expect(morning?.id).toBe(evening?.id);
  });

  it("advances across days (not frozen on one quote)", () => {
    const quotes = [quote("a"), quote("b"), quote("c"), quote("d"), quote("e")];
    const picks = new Set<string>();
    for (let d = 0; d < 30; d++) {
      picks.add(pickDailyQuote(quotes, new Date(2026, 6, 1 + d))!.id);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it("falls back to the full set when nothing is favorited", () => {
    const quotes = [quote("a"), quote("b"), quote("c")];
    for (let d = 0; d < 60; d++) {
      expect(pickDailyQuote(quotes, new Date(2026, 6, 1 + d))).not.toBeNull();
    }
  });

  it("biases toward favorites the majority of days", () => {
    // 1 favorite among 5; without bias it would surface ~20% of days.
    const quotes = [quote("fav", true), quote("b"), quote("c"), quote("d"), quote("e")];
    let favDays = 0;
    const DAYS = 200;
    for (let d = 0; d < DAYS; d++) {
      if (pickDailyQuote(quotes, new Date(2026, 0, 1 + d))!.id === "fav") favDays++;
    }
    // Far above the unbiased 20% baseline, and near the 65% bias share.
    expect(favDays / DAYS).toBeGreaterThan(0.5);
  });

  it("dayNumber is stable per local calendar day and increments daily", () => {
    expect(dayNumber(new Date(2026, 6, 19, 0, 0, 0))).toBe(dayNumber(new Date(2026, 6, 19, 23, 59, 0)));
    expect(dayNumber(new Date(2026, 6, 20)) - dayNumber(new Date(2026, 6, 19))).toBe(1);
  });
});
