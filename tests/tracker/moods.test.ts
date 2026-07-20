/// <reference types="vitest/globals" />

import { DEFAULT_MOODS, moodByValue, moodRange, moodTier, type Mood } from "@/lib/tracker/moods";

const mk = (value: number): Mood => ({ id: `m${value}`, label: `m${value}`, color: "slate", value });

describe("moodRange", () => {
  it("falls back to a 1–5 range when there are no moods", () => {
    expect(moodRange([])).toEqual({ min: 1, max: 5, mid: 3 });
  });

  it("derives min/max/mid from the configured values", () => {
    expect(moodRange([mk(1), mk(2), mk(3), mk(4), mk(5)])).toEqual({ min: 1, max: 5, mid: 3 });
    expect(moodRange([mk(2), mk(6)])).toEqual({ min: 2, max: 6, mid: 4 });
  });
});

describe("moodTier", () => {
  it("reproduces the old ≥4 / ≤2 split on a 1–5 scale", () => {
    const range = moodRange([mk(1), mk(2), mk(3), mk(4), mk(5)]);
    expect(moodTier(1, range)).toBe("bad");
    expect(moodTier(2, range)).toBe("bad");
    expect(moodTier(3, range)).toBe("neutral");
    expect(moodTier(4, range)).toBe("good");
    expect(moodTier(5, range)).toBe("good");
  });

  it("adapts to a wider scale", () => {
    const range = moodRange([mk(1), mk(10)]); // span 9, band 3.6
    expect(moodTier(1, range)).toBe("bad"); // <= 4.6
    expect(moodTier(4, range)).toBe("bad");
    expect(moodTier(5, range)).toBe("neutral");
    expect(moodTier(10, range)).toBe("good"); // >= 6.4
  });

  it("is neutral when the scale has no span", () => {
    expect(moodTier(3, moodRange([mk(3)]))).toBe("neutral");
  });
});

describe("moodByValue", () => {
  it("finds the mood at a value, or null", () => {
    const moods = DEFAULT_MOODS.map((m, i) => ({ id: String(i), ...m }));
    expect(moodByValue(moods, 3)?.label).toBe("Okay");
    expect(moodByValue(moods, 99)).toBeNull();
    expect(moodByValue(moods, null)).toBeNull();
  });
});
