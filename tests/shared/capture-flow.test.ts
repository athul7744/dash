/// <reference types="vitest/globals" />

/**
 * The universal-capture write path, end to end below the UI: an incoming share
 * payload (or pasted text) is classified, its shared fields are projected onto
 * the chosen app, persisted, and turned into a deep link.
 *
 * The seams here are the ones that fail silently. `buildCaptureInput` decides
 * which fields each app keeps, and `saveCapture` decides how they are spelled
 * for that app's writer — a URL that reaches a bookmark as its address but a
 * quote as its source. Both are pure dispatch, so the writers are mocked and
 * the assertions are on their arguments.
 */

const writers = vi.hoisted(() => ({
  createBookmark: vi.fn(async () => "bookmark-1"),
  refreshBookmarkMetadata: vi.fn(async () => undefined),
  createNoteFromText: vi.fn(async () => "note-1"),
  createQuote: vi.fn(async () => "quote-1"),
  createTask: vi.fn(async () => "task-1"),
}));

vi.mock("@/lib/bookmarks/bookmarks", () => ({ createBookmark: writers.createBookmark }));
vi.mock("@/lib/bookmarks/fetch-metadata", () => ({ refreshBookmarkMetadata: writers.refreshBookmarkMetadata }));
vi.mock("@/lib/notes/notes", () => ({ createNoteFromText: writers.createNoteFromText }));
vi.mock("@/lib/quotes/quotes", () => ({ createQuote: writers.createQuote }));
vi.mock("@/lib/tasks/create-task", () => ({ createTask: writers.createTask }));

import { classifyShare } from "@/lib/shared/capture";
import {
  buildCaptureInput,
  captureResultHref,
  saveCapture,
  type CaptureFields,
} from "@/lib/shared/capture-actions";
import { readIncomingSharePayload } from "@/lib/shared/share";

/** The triage's opening state for a share payload (see `CaptureTriage`). */
function triage(params: Record<string, string>) {
  const payload = readIncomingSharePayload({ get: (name) => params[name] ?? null });
  const classification = classifyShare(payload);
  const fields: CaptureFields = {
    url: classification.link,
    title: payload.title,
    text: payload.text,
    author: "",
    tags: [],
  };
  return { payload, classification, fields };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("capture flow", () => {
  it("sends a shared link to Bookmarks and fetches the missing preview", async () => {
    const { classification, fields } = triage({
      url: "https://www.youtube.com/watch?v=abc",
      title: "A talk",
      text: "Worth a watch",
    });

    expect(classification).toEqual({
      target: "bookmark",
      link: "https://www.youtube.com/watch?v=abc",
      platform: "youtube",
    });

    const result = await saveCapture(buildCaptureInput(classification.target, fields));

    expect(writers.createBookmark).toHaveBeenCalledWith({
      url: "https://www.youtube.com/watch?v=abc",
      title: "A talk",
      note: "Worth a watch",
      tags: [],
    });
    // The user gave a title, so only the preview is fetched.
    expect(writers.refreshBookmarkMetadata).toHaveBeenCalledWith(
      "bookmark-1",
      "https://www.youtube.com/watch?v=abc",
      { setTitle: false },
    );
    expect(result).toEqual({ appId: "bookmarks", itemId: "bookmark-1" });
    expect(captureResultHref(result)).toBe("/bookmarks");
  });

  it("lets the metadata fetch fill an untitled bookmark", async () => {
    const { classification, fields } = triage({ url: "https://example.com/post" });

    await saveCapture(buildCaptureInput(classification.target, fields));

    expect(writers.refreshBookmarkMetadata).toHaveBeenCalledWith("bookmark-1", "https://example.com/post", {
      setTitle: true,
    });
  });

  it("sends short text to Quotes with the shared URL as its source", async () => {
    const { classification, fields } = triage({ text: "Simplicity is prerequisite for reliability." });
    expect(classification.target).toBe("quote");

    const result = await saveCapture(
      buildCaptureInput("quote", { ...fields, url: "https://example.com/quote", author: "Edsger" }),
    );

    expect(writers.createQuote).toHaveBeenCalledWith({
      text: "Simplicity is prerequisite for reliability.",
      author: "Edsger",
      link: "https://example.com/quote",
    });
    expect(result.appId).toBe("quotes");
    expect(captureResultHref(result)).toBe("/quotes");
  });

  it("sends multi-paragraph prose to Notes, titled by the payload", async () => {
    const text = "First paragraph about the plan.\n\nSecond paragraph with the details.";
    const { classification, fields } = triage({ title: "Plan", text });

    expect(classification.target).toBe("note");
    const result = await saveCapture(buildCaptureInput(classification.target, fields));

    expect(writers.createNoteFromText).toHaveBeenCalledWith("Plan", text);
    expect(result.appId).toBe("notes");
    expect(captureResultHref(result)).toBe("/notes/note-1");
  });

  it("names an untitled captured note", async () => {
    const { fields } = triage({ text: "One.\n\nTwo." });

    await saveCapture(buildCaptureInput("note", { ...fields, title: "" }));

    expect(writers.createNoteFromText).toHaveBeenCalledWith("Captured note", "One.\n\nTwo.");
  });

  it("carries the link, due date, tags, and priority through a Task capture", async () => {
    const dueDate = new Date("2026-11-20T00:00:00.000Z");
    const fields: CaptureFields = {
      url: "https://example.com/spec",
      title: "Read the spec",
      text: "ignore me",
      author: "",
      dueDate,
      tags: ["tag-1"],
    };

    const result = await saveCapture({ ...buildCaptureInput("task", fields), priority: "high" });

    expect(writers.createTask).toHaveBeenCalledWith({
      title: "Read the spec",
      link: "https://example.com/spec",
      dueDate,
      tags: ["tag-1"],
      priority: "high",
    });
    expect(captureResultHref(result)).toBe("/tasks");
  });

  it("drops fields the target does not store", () => {
    const fields: CaptureFields = {
      url: "https://example.com",
      title: "T",
      text: "Body",
      author: "A",
      dueDate: new Date("2026-11-20T00:00:00.000Z"),
      tags: ["tag-1"],
    };

    expect(buildCaptureInput("bookmark", fields)).toEqual({
      target: "bookmark",
      url: "https://example.com",
      title: "T",
      note: "Body",
      tags: ["tag-1"],
    });
    expect(buildCaptureInput("quote", fields)).toEqual({
      target: "quote",
      text: "Body",
      author: "A",
      link: "https://example.com",
    });
    expect(buildCaptureInput("note", fields)).toEqual({
      target: "note",
      title: "T",
      text: "Body",
    });
  });
});
