import { describe, expect, it } from "vitest";

import { classifyShare, detectPlatform, looksLikeQuote } from "@/lib/shared/capture";
import type { IncomingSharePayload } from "@/lib/shared/share";

function payload(p: Partial<IncomingSharePayload>): IncomingSharePayload {
  return { title: "", text: "", url: "", ...p };
}

describe("detectPlatform", () => {
  it("recognizes common platforms by host", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectPlatform("https://youtu.be/abc")).toBe("youtube");
    expect(detectPlatform("https://m.youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectPlatform("https://instagram.com/reel/xyz")).toBe("instagram");
    expect(detectPlatform("https://x.com/user/status/1")).toBe("x");
    expect(detectPlatform("https://twitter.com/user/status/1")).toBe("x");
    expect(detectPlatform("https://www.reddit.com/r/soccer")).toBe("reddit");
    expect(detectPlatform("https://github.com/user/repo")).toBe("github");
  });

  it("returns null for unknown or invalid urls", () => {
    expect(detectPlatform("https://example.com/article")).toBeNull();
    expect(detectPlatform("not a url")).toBeNull();
    expect(detectPlatform("")).toBeNull();
  });
});

describe("looksLikeQuote", () => {
  it("treats short or quoted single-paragraph text as a quote", () => {
    expect(looksLikeQuote("The only way out is through.")).toBe(true);
    expect(looksLikeQuote("“Stay hungry, stay foolish.”")).toBe(true);
  });

  it("treats long or multi-paragraph prose as not a quote", () => {
    expect(looksLikeQuote("a".repeat(400))).toBe(false);
    expect(looksLikeQuote("First paragraph.\n\nSecond paragraph.")).toBe(false);
    expect(looksLikeQuote("")).toBe(false);
  });
});

describe("classifyShare", () => {
  it("routes a shared URL to bookmark with platform", () => {
    const c = classifyShare(payload({ url: "https://youtu.be/abc", title: "A video" }));
    expect(c.target).toBe("bookmark");
    expect(c.link).toBe("https://youtu.be/abc");
    expect(c.platform).toBe("youtube");
  });

  it("extracts a URL embedded in shared text", () => {
    const c = classifyShare(payload({ text: "great read https://example.com/post cheers" }));
    expect(c.target).toBe("bookmark");
    expect(c.link).toBe("https://example.com/post");
    expect(c.platform).toBeNull();
  });

  it("routes short text with no URL to quote", () => {
    const c = classifyShare(payload({ text: "Football is nothing without fans." }));
    expect(c.target).toBe("quote");
    expect(c.link).toBe("");
  });

  it("routes long prose with no URL to note", () => {
    const c = classifyShare(payload({ text: "Intro paragraph.\n\nA second, longer paragraph of prose." }));
    expect(c.target).toBe("note");
  });

  it("falls back to note for an empty payload", () => {
    expect(classifyShare(payload({})).target).toBe("note");
  });
});
