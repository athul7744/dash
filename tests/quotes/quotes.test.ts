/// <reference types="vitest/globals" />

// quotes.ts pulls in the DB + link/notes helpers at import; stub them so the
// pure parse function can be exercised without PowerSync.
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), getOptional: vi.fn(), getAll: vi.fn() } }));
vi.mock("@/lib/notes/notes", () => ({ ensureSystemPage: vi.fn(async () => "page-1") }));
vi.mock("@/lib/links/links", () => ({ deleteEntityEdges: vi.fn() }));
vi.mock("@/lib/events/events", () => ({ deleteSubjectOccurrences: vi.fn() }));
vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId: vi.fn(async () => "user-1") }));

import { parseQuoteContent } from "@/lib/quotes/quotes";

describe("parseQuoteContent", () => {
  it("reads text, author, link, and favorite", () => {
    const c = parseQuoteContent(JSON.stringify({ text: "t", author: "a", link: "https://x.com/p", favorite: true }));
    expect(c).toEqual({ text: "t", author: "a", link: "https://x.com/p", favorite: true });
  });

  it("defaults every field on an empty object", () => {
    expect(parseQuoteContent("{}")).toEqual({ text: "", author: "", link: "", favorite: false });
  });

  it("defaults a quote saved before the link field existed", () => {
    const c = parseQuoteContent(JSON.stringify({ text: "old", author: "someone", favorite: false }));
    expect(c.link).toBe("");
    expect(c.text).toBe("old");
  });

  it("ignores a non-string link", () => {
    expect(parseQuoteContent(JSON.stringify({ link: 42 })).link).toBe("");
  });

  it("tolerates malformed JSON", () => {
    expect(parseQuoteContent("not json")).toEqual({ text: "", author: "", link: "", favorite: false });
    expect(parseQuoteContent(null)).toEqual({ text: "", author: "", link: "", favorite: false });
  });
});
