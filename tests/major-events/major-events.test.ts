/// <reference types="vitest/globals" />

// major-events.ts pulls in the DB + notes helpers at import; stub them so the
// pure helpers can be exercised without PowerSync (the quotes suite does the same).
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), getOptional: vi.fn(), getAll: vi.fn() } }));
vi.mock("@/lib/notes/notes", () => ({
  ensureSystemPage: vi.fn(async () => "page-1"),
  nextSortRank: vi.fn(async () => "0|hzzzzz:"),
}));
vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId: vi.fn(async () => "user-1") }));
vi.mock("@/lib/tags/entity-tags", () => ({
  setEntityTags: vi.fn(async () => {}),
  deleteEntityTags: vi.fn(async () => {}),
}));

import {
  createMajorEvent,
  deleteMajorEvent,
  groupByYear,
  groupEventsForDays,
  majorEventDayKey,
  MAX_MAJOR_EVENT_TAGS,
  parseMajorEventContent,
  restoreMajorEvent,
  summarizeDayEvents,
  updateMajorEvent,
  type MajorEvent,
} from "@/lib/major-events/major-events";
import { deleteEntityTags, setEntityTags } from "@/lib/tags/entity-tags";
import { db } from "@/lib/powersync/db";

function event(over: Partial<MajorEvent> = {}): MajorEvent {
  return {
    id: over.id ?? "e1",
    at: over.at ?? "2026-04-18",
    title: over.title ?? "Left the job",
    note: over.note ?? "",
    emoji: over.emoji ?? null,
    tagIds: over.tagIds ?? [],
    sortRank: over.sortRank ?? "0|hzzzzz:",
  };
}

describe("parseMajorEventContent", () => {
  it("reads every stored field", () => {
    const content = parseMajorEventContent(
      JSON.stringify({ at: "2026-04-18", title: "Left the job", note: "On good terms.", emoji: "briefcase" }),
    );
    expect(content).toEqual({
      at: "2026-04-18",
      title: "Left the job",
      note: "On good terms.",
      emoji: "briefcase",
    });
  });

  it("defaults note and emoji, and refuses a row with no date", () => {
    expect(parseMajorEventContent(JSON.stringify({ title: "Bare" }))).toEqual({
      at: "",
      title: "Bare",
      note: "",
      emoji: null,
    });
  });

  it("survives malformed JSON", () => {
    expect(parseMajorEventContent("{not json")).toEqual({ at: "", title: "", note: "", emoji: null });
  });

  it("ignores a colour written before events wore tags", () => {
    // The field is gone from the shape; an old row keeps it in its JSON and
    // nothing reads it, so it must not leak into the parsed content.
    const content = parseMajorEventContent(JSON.stringify({ at: "2026-04-18", color: "chartreuse" }));
    expect(content).not.toHaveProperty("color");
    expect(content).toEqual({ at: "2026-04-18", title: "", note: "", emoji: null });
  });

  it("takes a date-prefixed string at face value rather than shifting it", () => {
    // Every writer stores a bare `yyyy-MM-dd`. If a row ever carries an instant,
    // the day it names is the day it means — converting through the viewer's
    // offset would move "18 Apr" to the 19th for anyone east of UTC.
    const content = parseMajorEventContent(JSON.stringify({ at: "2026-04-18T23:30:00.000Z", title: "Late" }));
    expect(content.at).toBe("2026-04-18");
  });

  it("treats a blank emoji as none", () => {
    const content = parseMajorEventContent(JSON.stringify({ at: "2026-04-18", emoji: "   " }));
    expect(content.emoji).toBeNull();
  });
});

describe("majorEventDayKey", () => {
  it("passes a calendar day through and normalizes an instant", () => {
    expect(majorEventDayKey("2026-04-18")).toBe("2026-04-18");
    expect(majorEventDayKey(new Date("2026-04-18T21:15:00"))).toBe("2026-04-18");
  });

  it("returns empty for nothing usable", () => {
    expect(majorEventDayKey("")).toBe("");
    expect(majorEventDayKey(null)).toBe("");
    expect(majorEventDayKey("not a date")).toBe("");
    expect(majorEventDayKey(new Date("nonsense"))).toBe("");
  });
});

describe("groupByYear", () => {
  it("puts the newest year first and the oldest day first inside it", () => {
    const years = groupByYear([
      event({ id: "a", at: "2025-12-31", title: "Zed" }),
      event({ id: "b", at: "2026-04-18", title: "Later" }),
      event({ id: "c", at: "2026-01-02", title: "Earlier" }),
      event({ id: "d", at: "2026-04-18", title: "Alpha" }),
    ]);

    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years[0].events.map((e) => e.title)).toEqual(["Earlier", "Alpha", "Later"]);
    expect(years[1].events.map((e) => e.title)).toEqual(["Zed"]);
  });

  it("drops rows with no readable date instead of inventing a year", () => {
    const years = groupByYear([event({ id: "x", at: "" }), event({ id: "y", at: "2026-01-01" })]);
    expect(years).toHaveLength(1);
    expect(years[0].events.map((e) => e.id)).toEqual(["y"]);
  });
});

describe("groupEventsForDays", () => {
  it("keeps only the requested days, in one bucket per day", () => {
    const byDay = groupEventsForDays(
      [
        event({ id: "a", at: "2026-11-22", title: "First" }),
        event({ id: "b", at: "2026-11-22", title: "Second" }),
        event({ id: "c", at: "2026-11-24", title: "Elsewhere in the week" }),
        event({ id: "d", at: "2026-12-01", title: "Outside the week" }),
      ],
      ["2026-11-22", "2026-11-23", "2026-11-24"],
    );

    expect([...byDay.keys()].sort()).toEqual(["2026-11-22", "2026-11-24"]);
    expect(byDay.get("2026-11-22")?.map((e) => e.id)).toEqual(["a", "b"]);
    // A day with nothing is simply absent, which is what the strips test for.
    expect(byDay.has("2026-11-23")).toBe(false);
  });

  it("returns nothing for a day set with no events", () => {
    expect(groupEventsForDays([event({ id: "a" })], ["2026-01-01"]).size).toBe(0);
    expect(groupEventsForDays([], ["2026-04-18"]).size).toBe(0);
  });
});

describe("summarizeDayEvents", () => {
  it("joins the titles and takes the first event's icon and tags", () => {
    const summary = summarizeDayEvents([
      event({ id: "a", title: "Left the job", emoji: "briefcase", tagIds: ["t1", "t2"] }),
      event({ id: "b", title: "Moved house", emoji: "house", tagIds: ["t3"] }),
    ]);
    expect(summary).toEqual({
      label: "Left the job · Moved house",
      emoji: "briefcase",
      tagIds: ["t1", "t2"],
      eventIds: ["a", "b"],
    });
  });
});

describe("tags ride the same writers as the block", () => {
  beforeEach(() => {
    vi.mocked(setEntityTags).mockClear();
    vi.mocked(deleteEntityTags).mockClear();
  });

  it("writes an event's tags on create, under the major-event kind", async () => {
    await createMajorEvent({ at: "2026-04-18", title: "Left the job", tagIds: ["t1"] });
    expect(setEntityTags).toHaveBeenCalledWith(expect.any(String), "major-event", ["t1"]);
  });

  it("skips the tag write on create when the event carries none", async () => {
    await createMajorEvent({ at: "2026-04-18", title: "Left the job" });
    expect(setEntityTags).not.toHaveBeenCalled();
  });

  it("replaces tags on update, and only when they were given", async () => {
    // An update reads the row first; without one there is nothing to write onto.
    vi.mocked(db.getOptional).mockResolvedValue({ content: JSON.stringify({ at: "2026-04-18", title: "Kept" }) });

    await updateMajorEvent("e1", { title: "Renamed" });
    expect(setEntityTags).not.toHaveBeenCalled();

    await updateMajorEvent("e1", { tagIds: ["t2"] });
    expect(setEntityTags).toHaveBeenCalledWith("e1", "major-event", ["t2"]);
  });

  it("clamps to two tags, deduped, so the rule holds for the data and not just the picker", async () => {
    expect(MAX_MAJOR_EVENT_TAGS).toBe(2);

    await createMajorEvent({ at: "2026-04-18", title: "Left the job", tagIds: ["t1", "t1", "t2", "t3"] });
    expect(setEntityTags).toHaveBeenLastCalledWith(expect.any(String), "major-event", ["t1", "t2"]);

    await updateMajorEvent("e1", { tagIds: ["t4", "t5", "t6"] });
    expect(setEntityTags).toHaveBeenLastCalledWith("e1", "major-event", ["t4", "t5"]);

    await restoreMajorEvent("e1", { at: "2026-04-18", title: "Kept", note: "", emoji: null }, "0|hzzzzz:", ["t7", "t8", "t9"]);
    expect(setEntityTags).toHaveBeenLastCalledWith("e1", "major-event", ["t7", "t8"]);
  });

  it("drops the tag rows when the event is deleted", async () => {
    await deleteMajorEvent("e1");
    expect(deleteEntityTags).toHaveBeenCalledWith("e1");
  });
});
