import { describe, expect, it } from "vitest";

import { greetingForHour, sublineForIndex, timeOfDayForHour } from "@/lib/shared/greeting";

describe("timeOfDayForHour", () => {
  it("maps hours to the right time-of-day at the boundaries", () => {
    expect(timeOfDayForHour(4)).toBe("night");
    expect(timeOfDayForHour(5)).toBe("morning");
    expect(timeOfDayForHour(11)).toBe("morning");
    expect(timeOfDayForHour(12)).toBe("afternoon");
    expect(timeOfDayForHour(16)).toBe("afternoon");
    expect(timeOfDayForHour(17)).toBe("evening");
    expect(timeOfDayForHour(21)).toBe("evening");
    expect(timeOfDayForHour(22)).toBe("night");
    expect(timeOfDayForHour(0)).toBe("night");
  });
});

describe("greetingForHour", () => {
  it("is deterministic for a given hour and index", () => {
    expect(greetingForHour(9, 3)).toBe(greetingForHour(9, 3));
  });

  it("returns a conventional greeting at index 0 per time-of-day", () => {
    expect(greetingForHour(9, 0)).toBe("Good morning");
    expect(greetingForHour(14, 0)).toBe("Good afternoon");
    expect(greetingForHour(19, 0)).toBe("Good evening");
  });

  it("wraps out-of-range indices back into the pool", () => {
    expect(greetingForHour(9, 0)).toBe(greetingForHour(9, 100000));
  });

  it("never returns an empty string", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (let index = 0; index < 6; index += 1) {
        expect(greetingForHour(hour, index).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("sublineForIndex", () => {
  it("is deterministic and non-empty, wrapping out-of-range indices", () => {
    expect(sublineForIndex(2)).toBe(sublineForIndex(2));
    expect(sublineForIndex(0)).toBe(sublineForIndex(100000));
    expect(sublineForIndex(0).length).toBeGreaterThan(0);
  });
});
