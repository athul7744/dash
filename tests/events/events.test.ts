/// <reference types="vitest/globals" />

// events.ts pulls in the DB + link/notes helpers at import; stub them so the
// pure parse/stats functions can be exercised without PowerSync.
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), getOptional: vi.fn(), getAll: vi.fn(), writeTransaction: vi.fn() } }));
vi.mock("@/lib/notes/notes", () => ({ ensureSystemPage: vi.fn(async () => "page-1") }));
vi.mock("@/lib/links/links", () => ({ deleteEntityEdges: vi.fn() }));
vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId: vi.fn(async () => "user-1") }));

import { computeThingStats, parseEventContent, parseOccurrenceContent } from "@/lib/events/events";

describe("parseEventContent", () => {
  it("defaults a missing/blank thing to a log-only (null schedule) shape", () => {
    const c = parseEventContent("{}");
    expect(c.schedule).toBeNull();
    expect(c.active).toBe(true);
    expect(c.daysBefore).toBe(3);
    expect(c.defaultPlace).toBe("");
    expect(c.tags).toEqual([]);
  });

  it("keeps a valid interval schedule and tolerates a malformed one", () => {
    expect(parseEventContent(JSON.stringify({ schedule: { freq: "interval", days: 3 } })).schedule).toEqual({ freq: "interval", days: 3 });
    expect(parseEventContent(JSON.stringify({ schedule: { freq: "bogus" } })).schedule).toBeNull();
    expect(parseEventContent("not json").schedule).toBeNull();
  });
});

describe("parseOccurrenceContent", () => {
  it("reads at/action/place/note/source/subjectKind with defaults", () => {
    expect(
      parseOccurrenceContent(JSON.stringify({ at: "2026-07-01T10:00:00.000Z", action: "Repaired", place: "Home", source: "task", subjectKind: "note" })),
    ).toEqual({
      at: "2026-07-01T10:00:00.000Z",
      action: "Repaired",
      place: "Home",
      note: "",
      source: "task",
      subjectKind: "note",
      subjectId: "",
    });
    expect(parseOccurrenceContent("{}")).toEqual({ at: "", action: "", place: "", note: "", source: "manual", subjectKind: "event", subjectId: "" });
  });

  it("defaults an unknown subjectKind to event", () => {
    expect(parseOccurrenceContent(JSON.stringify({ subjectKind: "bogus" })).subjectKind).toBe("event");
  });
});

describe("computeThingStats", () => {
  const now = new Date("2026-07-20T00:00:00.000Z");

  it("returns empty stats when never logged", () => {
    const s = computeThingStats({ count: 0, firstAt: null, lastAt: null, cadenceDays: null }, now);
    expect(s).toMatchObject({ count: 0, lastAt: null, avgGapDays: null, expectedGapDays: null, overdue: false, nextDueAt: null });
  });

  it("derives average gap and next-due from occurrences", () => {
    // 4 occurrences spanning 30 days → avg gap 10 days.
    const s = computeThingStats(
      { count: 4, firstAt: "2026-06-10T00:00:00.000Z", lastAt: "2026-07-10T00:00:00.000Z", cadenceDays: null },
      now,
    );
    expect(Math.round(s.avgGapDays!)).toBe(10);
    // last was the 10th, +10d → due the 20th (today) → not yet overdue (needs >1.15×).
    expect(s.overdue).toBe(false);
    expect(s.nextDueAt).toBe("2026-07-20T00:00:00.000Z");
  });

  it("flags overdue against an explicit cadence", () => {
    // cadence 3d, last 10 days ago → well past 3×1.15.
    const s = computeThingStats({ count: 5, firstAt: "2026-06-01T00:00:00.000Z", lastAt: "2026-07-10T00:00:00.000Z", cadenceDays: 3 }, now);
    expect(s.expectedGapDays).toBe(3);
    expect(s.overdue).toBe(true);
  });
});
