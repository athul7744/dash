/// <reference types="vitest/globals" />

/**
 * Which fields each capture target keeps.
 *
 * The triage backs every target with one set of fields, so the mapping is where a
 * value gets silently dropped: a field the user filled reaches the save call for
 * one target and vanishes for another. Quotes lost their source link exactly this
 * way, so each target is pinned to what it stores.
 */

vi.mock("@/lib/bookmarks/bookmarks", () => ({ createBookmark: vi.fn() }));
vi.mock("@/lib/bookmarks/fetch-metadata", () => ({ refreshBookmarkMetadata: vi.fn() }));
vi.mock("@/lib/notes/notes", () => ({ createNoteFromText: vi.fn() }));
vi.mock("@/lib/quotes/quotes", () => ({ createQuote: vi.fn() }));
vi.mock("@/lib/tasks/create-task", () => ({ createTask: vi.fn() }));

import { buildCaptureInput, type CaptureFields } from "@/lib/shared/capture-actions";

const dueDate = new Date("2026-09-05T00:00:00.000Z");

function fields(over: Partial<CaptureFields> = {}): CaptureFields {
  return {
    url: "https://example.com/essay",
    title: "An essay",
    text: "Some body text",
    author: "A writer",
    dueDate,
    tags: ["t1"],
    ...over,
  };
}

describe("buildCaptureInput", () => {
  it("gives a quote its source link", () => {
    expect(buildCaptureInput("quote", fields())).toEqual({
      target: "quote",
      text: "Some body text",
      author: "A writer",
      link: "https://example.com/essay",
    });
  });

  it("carries an empty source link through rather than inventing one", () => {
    expect(buildCaptureInput("quote", fields({ url: "" })).link).toBe("");
  });

  it("makes the url a bookmark's address and the body its note", () => {
    expect(buildCaptureInput("bookmark", fields())).toEqual({
      target: "bookmark",
      url: "https://example.com/essay",
      title: "An essay",
      note: "Some body text",
      tags: ["t1"],
    });
  });

  it("makes the url a task's link, with its scheduling fields", () => {
    expect(buildCaptureInput("task", fields())).toEqual({
      target: "task",
      title: "An essay",
      link: "https://example.com/essay",
      dueDate,
      tags: ["t1"],
    });
  });

  it("keeps a note to its title and body", () => {
    expect(buildCaptureInput("note", fields())).toEqual({
      target: "note",
      title: "An essay",
      text: "Some body text",
    });
  });
});
