/// <reference types="vitest/globals" />

export {};

import { parseRefTokens, stripRefs, formatRefToken, normalizeRefLabel } from "@/lib/links/tokens";

describe("parseRefTokens", () => {
  it("parses a legacy title token", () => {
    expect(parseRefTokens("see [[Grocery]] today")).toEqual([{ label: "Grocery" }]);
  });

  it("parses an id-bound token with kind + id", () => {
    expect(parseRefTokens("[[Buy milk|task:11111111-2222-3333-4444-555555555555]]")).toEqual([
      { label: "Buy milk", kind: "task", id: "11111111-2222-3333-4444-555555555555" },
    ]);
  });

  it("parses a mix in document order and keeps duplicates", () => {
    const tokens = parseRefTokens("[[A]] and [[A]] and [[B|note:abc]]");
    expect(tokens).toEqual([{ label: "A" }, { label: "A" }, { label: "B", kind: "note", id: "abc" }]);
  });

  it("ignores `#` (not a token) and empty labels", () => {
    expect(parseRefTokens("#new [[  ]] text")).toEqual([]);
  });
});

describe("stripRefs", () => {
  it("reduces tokens to their labels", () => {
    expect(stripRefs("Buy [[Grocery|note:abc]] before [[Sun]]")).toBe("Buy Grocery before Sun");
  });

  it("is a no-op on plain text", () => {
    expect(stripRefs("nothing here")).toBe("nothing here");
  });
});

describe("formatRefToken", () => {
  it("emits an id-bound token", () => {
    expect(formatRefToken({ label: "Note A", kind: "note", id: "abc" })).toBe("[[Note A|note:abc]]");
  });

  it("emits a legacy token when there is no id", () => {
    expect(formatRefToken({ label: "Note A" })).toBe("[[Note A]]");
  });

  it("strips grammar characters from the label", () => {
    expect(normalizeRefLabel("a|b][c")).toBe("abc");
    expect(formatRefToken({ label: "we|ird]]", kind: "task", id: "1" })).toBe("[[weird|task:1]]");
  });
});

describe("day references", () => {
  it("parses a day token like any other kind", () => {
    // `day` had to be added to the kind list *inside* the token regex, not just
    // the type — a kind the regex doesn't know reads as a plain label.
    const [token] = parseRefTokens("see [[Tue, Sep 15, 2026|day:0d6ba1ec-6d4e-5f3a-9c2b-1f0e8a7d4c33]]");
    expect(token).toEqual({
      label: "Tue, Sep 15, 2026",
      kind: "day",
      id: "0d6ba1ec-6d4e-5f3a-9c2b-1f0e8a7d4c33",
    });
  });

  it("round-trips through formatRefToken", () => {
    const token = formatRefToken({
      label: "Tue, Sep 15, 2026",
      kind: "day",
      id: "0d6ba1ec-6d4e-5f3a-9c2b-1f0e8a7d4c33",
    });
    expect(parseRefTokens(token)[0]?.kind).toBe("day");
  });

  it("strips to its label like every other kind", () => {
    expect(stripRefs("on [[Tue, Sep 15, 2026|day:0d6ba1ec-6d4e-5f3a-9c2b-1f0e8a7d4c33]] I ran")).toBe(
      "on Tue, Sep 15, 2026 I ran",
    );
  });
});
