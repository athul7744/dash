/// <reference types="vitest/globals" />

import {
  buildSharedTaskTitle,
  readIncomingSharePayload,
  resolveSharedLink,
  type IncomingSharePayload,
} from "@/lib/shared/share";
import { extractFirstUrl } from "@/lib/tasks/tasks";

const payload = (over: Partial<IncomingSharePayload> = {}): IncomingSharePayload => ({
  title: "",
  text: "",
  url: "",
  ...over,
});

describe("extractFirstUrl", () => {
  it("finds a mid-text URL and trims trailing punctuation", () => {
    expect(extractFirstUrl("Check this out https://github.com/foo/bar, thanks")).toBe(
      "https://github.com/foo/bar"
    );
  });

  it("normalizes a bare www. URL by adding a scheme", () => {
    expect(extractFirstUrl("see www.example.com for more")).toBe("https://www.example.com");
  });

  it("returns null when there is no URL", () => {
    expect(extractFirstUrl("no link here at all")).toBeNull();
  });
});

describe("resolveSharedLink", () => {
  it("prefers the url param", () => {
    expect(resolveSharedLink(payload({ url: "https://example.com", text: "https://other.com" }))).toBe(
      "https://example.com"
    );
  });

  it("falls back to a URL embedded in text", () => {
    expect(resolveSharedLink(payload({ text: "look at https://example.com/x here" }))).toBe(
      "https://example.com/x"
    );
  });

  it("falls back to the title when text has none", () => {
    expect(resolveSharedLink(payload({ title: "https://example.com/from-title" }))).toBe(
      "https://example.com/from-title"
    );
  });

  it("returns empty string when no URL is present", () => {
    expect(resolveSharedLink(payload({ title: "just a note", text: "no url" }))).toBe("");
  });
});

describe("buildSharedTaskTitle with excludeUrl", () => {
  it("removes the URL from the text and keeps the surrounding words", () => {
    const p = payload({ text: "Check this out https://github.com/foo/bar thanks" });
    expect(buildSharedTaskTitle(p, { excludeUrl: "https://github.com/foo/bar" })).toBe(
      "Check this out thanks"
    );
  });

  it("preserves newlines while stripping the URL", () => {
    const p = payload({ text: "line one\nhttps://example.com\nline two" });
    expect(buildSharedTaskTitle(p, { excludeUrl: "https://example.com" })).toBe("line one\nline two");
  });

  it("falls back to 'Shared item' when the URL was the only content", () => {
    const p = payload({ text: "https://example.com" });
    expect(buildSharedTaskTitle(p, { excludeUrl: "https://example.com" })).toBe("Shared item");
  });

  it("without opts, keeps existing behavior (appends the url line)", () => {
    const p = payload({ title: "Cool site", url: "https://example.com" });
    expect(buildSharedTaskTitle(p)).toBe("Cool site\n\nhttps://example.com");
  });
});

describe("readIncomingSharePayload", () => {
  it("accepts a URLSearchParams directly", () => {
    const params = new URLSearchParams({ title: " Hi ", text: "body", url: "https://x.com" });
    expect(readIncomingSharePayload(params)).toEqual({ title: "Hi", text: "body", url: "https://x.com" });
  });
});
