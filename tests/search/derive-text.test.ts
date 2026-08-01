/// <reference types="vitest/globals" />

export {};

import { deriveBlockEntity, deriveNotePage, deriveOccurrence, deriveTask } from "@/lib/search/derive-text";

describe("deriveTask", () => {
  it("strips ref tokens from the title and folds tags + link into aux", () => {
    const doc = deriveTask({
      id: "t1",
      title: "Call [[Alice|note:abc]] about the deal",
      tags: JSON.stringify(["work", "urgent"]),
      link: "https://example.com",
    });
    expect(doc).toMatchObject({ kind: "task", id: "t1", body: "" });
    expect(doc.title).toBe("Call Alice about the deal");
    expect(doc.aux).toContain("work urgent");
    expect(doc.aux).toContain("https://example.com");
  });

  it("tolerates malformed tags and empty title", () => {
    const doc = deriveTask({ id: "t2", title: null, tags: "not json", link: null });
    expect(doc.title).toBe("Untitled task");
    expect(doc.aux).toBe("");
  });
});

describe("deriveNotePage", () => {
  it("aggregates title + every block's plain text", () => {
    const blocks = [
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }] }),
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "second block" }] }] }),
    ];
    const doc = deriveNotePage({ id: "p1", title: "My Page" }, blocks);
    expect(doc.kind).toBe("note");
    expect(doc.title).toBe("My Page");
    expect(doc.body).toContain("hello world");
    expect(doc.body).toContain("second block");
  });

  it("falls back to Untitled page and empty body", () => {
    const doc = deriveNotePage({ id: "p2", title: "  " }, []);
    expect(doc.title).toBe("Untitled page");
    expect(doc.body).toBe("");
  });
});

describe("deriveBlockEntity", () => {
  it("bookmark: title falls back to host, url + host + tags in aux", () => {
    const doc = deriveBlockEntity("bookmark", {
      id: "b1",
      content: JSON.stringify({ url: "https://news.example.com/story", title: "", note: "read later", tags: ["x"] }),
    });
    expect(doc.title).toBe("news.example.com");
    expect(doc.body).toBe("read later");
    expect(doc.aux).toContain("news.example.com");
    expect(doc.aux).toContain("x");
  });

  it("quote: text becomes title + body, author is aux", () => {
    const doc = deriveBlockEntity("quote", {
      id: "q1",
      content: JSON.stringify({ text: "Stay hungry", author: "Jobs" }),
    });
    expect(doc.title).toBe("Stay hungry");
    expect(doc.body).toBe("Stay hungry");
    expect(doc.aux).toBe("Jobs");
  });

  it("occurrence: pulls subject + text fields from content", () => {
    const doc = deriveOccurrence({
      id: "o1",
      content: JSON.stringify({ at: "2026-01-02T09:00:00Z", action: "ran", place: "park", note: "5k", subjectId: "s1", subjectKind: "event" }),
    });
    expect(doc).toEqual({ occId: "o1", thingId: "s1", thingKind: "event", at: "2026-01-02T09:00:00Z", action: "ran", place: "park", note: "5k" });
  });

  it("event: title stripped of refs, tags in aux", () => {
    const doc = deriveBlockEntity("event", {
      id: "e1",
      content: JSON.stringify({ title: "Gym [[Yoga|note:abc]]", tags: ["health"] }),
    });
    expect(doc.title).toBe("Gym Yoga");
    expect(doc.aux).toBe("health");
  });
});
