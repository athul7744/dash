/// <reference types="vitest/globals" />

export {};

import {
  buildMatch,
  escapeLike,
  fuzzyMatchTitle,
  fuzzyThreshold,
  HL_END,
  HL_START,
  levenshtein,
  markLike,
  parseSearchQuery,
  stripHighlight,
  toHighlightSegments,
  toMatchQuery,
} from "@/lib/search/match-query";

describe("toMatchQuery", () => {
  it("prefix-matches each token with implicit AND", () => {
    expect(toMatchQuery("meeting me")).toBe("meeting* me*");
  });

  it("lowercases and keeps unicode letters/numbers", () => {
    expect(toMatchQuery("Café 42")).toBe("café* 42*");
  });

  it("strips FTS operators and punctuation", () => {
    expect(toMatchQuery('"foo" OR -bar: baz*')).toBe("foo* or* bar* baz*");
  });

  it("returns empty when nothing usable remains", () => {
    expect(toMatchQuery("   ***  ")).toBe("");
    expect(toMatchQuery("")).toBe("");
  });
});

describe("escapeLike", () => {
  it("escapes wildcards and the escape char itself", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLike("hello world")).toBe("hello world");
  });
});

describe("highlight helpers", () => {
  const mark = (s: string) => `${HL_START}${s}${HL_END}`;

  it("markLike wraps the first case-insensitive match", () => {
    expect(markLike("Hello World", "wor")).toBe(`Hello ${mark("Wor")}ld`);
    expect(markLike("no match here", "zzz")).toBe("no match here");
  });

  it("toHighlightSegments splits marked runs", () => {
    expect(toHighlightSegments(`a ${mark("b")} c`)).toEqual([
      { text: "a ", hit: false },
      { text: "b", hit: true },
      { text: " c", hit: false },
    ]);
  });

  it("stripHighlight removes all markers", () => {
    expect(stripHighlight(`x ${mark("y")} z`)).toBe("x y z");
  });

  it("round-trips: strip(markLike) === original", () => {
    expect(stripHighlight(markLike("Meeting notes", "note"))).toBe("Meeting notes");
  });
});

describe("parseSearchQuery", () => {
  it("extracts kind: filters (with aliases) and leaves the rest as terms", () => {
    const p = parseSearchQuery("kind:notes budget k:link plan");
    expect(p.kinds.sort()).toEqual(["bookmark", "note"]);
    expect(p.terms).toEqual(["budget", "plan"]);
    expect(p.phrases).toEqual([]);
  });

  it("extracts quoted exact phrases", () => {
    const p = parseSearchQuery('meeting "quarterly review" notes');
    expect(p.phrases).toEqual(["quarterly review"]);
    expect(p.terms).toEqual(["meeting", "notes"]);
  });

  it("leaves an unknown kind: value as ordinary text", () => {
    const p = parseSearchQuery("kind:widget foo");
    expect(p.kinds).toEqual([]);
    expect(p.terms).toEqual(["kind", "widget", "foo"]);
  });
});

describe("buildMatch", () => {
  it("locks phrases as adjacency and prefixes free terms", () => {
    expect(buildMatch({ kinds: [], phrases: ["quarterly review"], terms: ["notes"] })).toBe('"quarterly review" notes*');
  });

  it("is empty when there is no text", () => {
    expect(buildMatch({ kinds: ["note"], phrases: [], terms: [] })).toBe("");
  });
});

describe("fuzzy matching", () => {
  it("levenshtein counts edits", () => {
    expect(levenshtein("meeting", "meetng")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("thresholds keep short terms exact", () => {
    expect(fuzzyThreshold(3)).toBe(0);
    expect(fuzzyThreshold(5)).toBe(1);
    expect(fuzzyThreshold(9)).toBe(2);
  });

  it("matches a typo'd term and marks the token", () => {
    const m = fuzzyMatchTitle("Weekly meeting notes", ["meetng"]);
    expect(m).not.toBeNull();
    expect(m!.distance).toBe(1);
    expect(stripHighlight(m!.marked)).toBe("Weekly meeting notes");
    expect(m!.marked).toContain(`${HL_START}meeting${HL_END}`);
  });

  it("returns null when a term can't match within threshold", () => {
    expect(fuzzyMatchTitle("Weekly meeting notes", ["zzzzzz"])).toBeNull();
  });

  it("treats a prefix as an exact (zero-distance) match", () => {
    const m = fuzzyMatchTitle("Meeting notes", ["meet"]);
    expect(m?.distance).toBe(0);
  });
});
