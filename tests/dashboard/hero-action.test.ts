import { describe, expect, it } from "vitest";

import { chooseHeroAction, type HeroSignals } from "@/lib/dashboard/hero-action";

// Base: everything satisfied (no pending tasks, logged recently, mood rated,
// journal written) — only the `plan` fallback is eligible.
function signals(overrides: Partial<HeroSignals> = {}): HeroSignals {
  return {
    timeOfDay: "morning",
    pendingCount: 0,
    overdueCount: 0,
    dueTodayCount: 0,
    loggedRecently: true,
    moodRatedToday: true,
    journalWrittenThisWeek: true,
    ...overrides,
  };
}

describe("chooseHeroAction", () => {
  it("morning with pending work → the most-relevant task", () => {
    expect(chooseHeroAction(signals({ timeOfDay: "morning", pendingCount: 2 }))).toBe("task");
  });

  it("morning overdue task beats a 2h tracking gap", () => {
    expect(
      chooseHeroAction(signals({ timeOfDay: "morning", pendingCount: 2, overdueCount: 1, loggedRecently: false })),
    ).toBe("task");
  });

  it("a 2h tracking gap with nothing pending → track", () => {
    expect(chooseHeroAction(signals({ timeOfDay: "afternoon", loggedRecently: false }))).toBe("track");
  });

  it("recently logged + pending → task, not track", () => {
    expect(
      chooseHeroAction(signals({ timeOfDay: "afternoon", pendingCount: 1, loggedRecently: true })),
    ).toBe("task");
  });

  it("evening with an unwritten journal → journal", () => {
    expect(
      chooseHeroAction(signals({ timeOfDay: "evening", journalWrittenThisWeek: false })),
    ).toBe("journal");
  });

  it("evening with journal written + pending → task", () => {
    expect(
      chooseHeroAction(signals({ timeOfDay: "evening", pendingCount: 1, journalWrittenThisWeek: true })),
    ).toBe("task");
  });

  it("night, mood not rated → mood", () => {
    expect(chooseHeroAction(signals({ timeOfDay: "night", moodRatedToday: false }))).toBe("mood");
  });

  it("night, mood rated but journal unwritten → journal", () => {
    expect(
      chooseHeroAction(signals({ timeOfDay: "night", moodRatedToday: true, journalWrittenThisWeek: false })),
    ).toBe("journal");
  });

  it("everything satisfied → plan fallback", () => {
    expect(chooseHeroAction(signals({ timeOfDay: "night" }))).toBe("plan");
  });
});
