/// <reference types="vitest/globals" />

export {};

import {
  buildQuery,
  parseChips,
  reformOnInput,
  removeKind,
  removeTag,
  withKind,
  withTag,
} from "@/lib/search/filter-tokens";

describe("parseChips", () => {
  it("plain text → no chips", () => {
    expect(parseChips("hello world")).toEqual({ kind: null, tag: null, terms: "hello world" });
  });

  it("kind only, with terms", () => {
    expect(parseChips("kind:task ship it")).toEqual({ kind: "task", tag: null, terms: "ship it" });
  });

  it("tag only, with terms", () => {
    expect(parseChips("tag:work ship it")).toEqual({ kind: null, tag: "work", terms: "ship it" });
  });

  it("kind + tag combine, order-independent", () => {
    expect(parseChips("kind:task tag:work foo")).toEqual({ kind: "task", tag: "work", terms: "foo" });
    expect(parseChips("tag:work kind:task foo")).toEqual({ kind: "task", tag: "work", terms: "foo" });
  });

  it("aliases resolve to the canonical kind", () => {
    expect(parseChips("kind:tasks x").kind).toBe("task");
    expect(parseChips("type:notes x").kind).toBe("note");
    expect(parseChips("k:links x").kind).toBe("bookmark");
  });

  it("only one kind and one tag survive (extras dropped, first wins)", () => {
    expect(parseChips("kind:task kind:note foo")).toEqual({ kind: "task", tag: null, terms: "foo" });
    expect(parseChips("tag:a tag:b foo")).toEqual({ kind: null, tag: "a", terms: "foo" });
  });

  it("an unknown kind is not chipped (stays as text)", () => {
    expect(parseChips("kind:bogus foo")).toEqual({ kind: null, tag: null, terms: "kind:bogus foo" });
  });

  it("a token still being typed (no trailing space) stays in terms", () => {
    expect(parseChips("kind:ta")).toEqual({ kind: null, tag: null, terms: "kind:ta" });
    expect(parseChips("kind:task tag:wo")).toEqual({ kind: "task", tag: null, terms: "tag:wo" });
  });

  it("committed with no terms keeps both chips", () => {
    expect(parseChips("kind:task tag:work ")).toEqual({ kind: "task", tag: "work", terms: "" });
  });
});

describe("buildQuery", () => {
  it("round-trips through parseChips", () => {
    expect(parseChips(buildQuery("task", "work", "foo"))).toEqual({ kind: "task", tag: "work", terms: "foo" });
    expect(parseChips(buildQuery("note", null, ""))).toEqual({ kind: "note", tag: null, terms: "" });
    expect(parseChips(buildQuery(null, "x", "hi"))).toEqual({ kind: null, tag: "x", terms: "hi" });
  });
});

describe("add / edit a kind filter", () => {
  it("adds to an empty query", () => {
    expect(withKind("", "task")).toBe("kind:task ");
  });
  it("adds alongside an existing tag (combo)", () => {
    expect(parseChips(withKind("tag:work ", "task"))).toEqual({ kind: "task", tag: "work", terms: "" });
  });
  it("replaces an existing kind (never two kinds)", () => {
    expect(parseChips(withKind("kind:note foo", "task"))).toEqual({ kind: "task", tag: null, terms: "foo" });
  });
  it("clears a half-typed kind token and keeps terms + tag", () => {
    expect(parseChips(withKind("kind:no tag:work foo", "task"))).toEqual({ kind: "task", tag: "work", terms: "foo" });
  });
});

describe("add / edit a tag filter", () => {
  it("adds to an empty query", () => {
    expect(withTag("", "reading")).toBe("tag:reading ");
  });
  it("adds alongside an existing kind (combo)", () => {
    expect(parseChips(withTag("kind:task ", "work"))).toEqual({ kind: "task", tag: "work", terms: "" });
  });
  it("replaces an existing tag (never two tags)", () => {
    expect(parseChips(withTag("tag:old foo", "new"))).toEqual({ kind: null, tag: "new", terms: "foo" });
  });
  it("keeps the kind when swapping the tag", () => {
    expect(parseChips(withTag("kind:note tag:old", "new"))).toEqual({ kind: "note", tag: "new", terms: "" });
  });
});

describe("delete a filter", () => {
  it("removeKind clears the kind, keeps tag + terms", () => {
    expect(parseChips(removeKind("kind:task tag:work foo"))).toEqual({ kind: null, tag: "work", terms: "foo" });
  });
  it("removeTag clears the tag, keeps kind + terms", () => {
    expect(parseChips(removeTag("kind:task tag:work foo"))).toEqual({ kind: "task", tag: null, terms: "foo" });
  });
  it("removing the only chip returns bare terms", () => {
    expect(removeKind("kind:task ")).toBe("");
    expect(removeTag("tag:work hello")).toBe("hello");
  });
});

describe("reformOnInput (typing in the terms field)", () => {
  it("keeps the active kind and appends typed text", () => {
    expect(reformOnInput("kind:task ", "foo")).toBe("kind:task foo");
  });
  it("blocks a second kind while one is active", () => {
    expect(parseChips(reformOnInput("kind:task ", "kind:note foo"))).toEqual({ kind: "task", tag: null, terms: "foo" });
  });
  it("blocks a second tag while one is active", () => {
    expect(parseChips(reformOnInput("tag:work ", "tag:home foo"))).toEqual({ kind: null, tag: "work", terms: "foo" });
  });
  it("lets the other filter type through to form a combo", () => {
    expect(reformOnInput("kind:task ", "tag:work")).toBe("kind:task tag:work");
    expect(reformOnInput("tag:work ", "kind:ta")).toBe("tag:work kind:ta");
  });
});
