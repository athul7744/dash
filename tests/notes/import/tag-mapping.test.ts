/// <reference types="vitest/globals" />

/**
 * What the import proposes for each tag value.
 *
 * The case that drives the design: in Logseq a tag *is* a page, and in a real
 * vault four of thirteen tag values (`Books To Read`, `Ideas`, `Things To Write`,
 * `Awesome Thoughts`) are also real pages — so those mean both a label and a link.
 */

import {
  buildTagCensus,
  tagDecisionProblem,
  tagActionKind,
  tagNameFor,
  tagNamesToCreate,
  tagNameWarning,
  type TagFileInput,
} from "@/lib/notes/import/tag-mapping";

function file(tagValues: string[], hashtags: string[] = []): TagFileInput {
  return { tagValues, hashtags };
}

describe("buildTagCensus", () => {
  it("splits a real tags line and counts files", () => {
    const census = buildTagCensus(
      [file(["Books To Read, life, meta"]), file(["Books To Read, business"])],
      [],
      [],
    );
    expect(census.map((entry) => [entry.label, entry.files])).toEqual([
      ["Books To Read", 2],
      ["business", 1],
      ["life", 1],
      ["meta", 1],
    ]);
  });

  it("collapses case, keeping the commonest spelling", () => {
    const census = buildTagCensus(
      [file([], ["#Notion", "#Notion"]), file([], ["#notion"])],
      [],
      [],
    );
    expect(census).toHaveLength(1);
    expect(census[0].label).toBe("#Notion".replace("#", ""));
    expect(census[0].variants).toEqual(["Notion", "notion"]);
  });

  it("maps onto an existing tag rather than creating a duplicate", () => {
    const census = buildTagCensus([file(["Business, Business"])], [{ id: "tag-1", name: "business" }], []);
    expect(census[0].suggested).toEqual({ tag: { existingId: "tag-1" }, link: false });
    expect(tagActionKind(census[0].suggested)).toBe("existing");
  });

  it("proposes both a tag and a link when the value is also a page", () => {
    const census = buildTagCensus([file(["Books To Read"])], [], ["Books To Read", "Sapiens"]);
    expect(census[0].isPageTitle).toBe(true);
    expect(census[0].suggested).toEqual({ tag: { createName: "Books To Read" }, link: true });
    expect(tagActionKind(census[0].suggested)).toBe("both");
  });

  it("creates a plain tag for a value used by several files", () => {
    const census = buildTagCensus([file(["meta"]), file(["meta"])], [], []);
    expect(census[0].suggested).toEqual({ tag: { createName: "meta" }, link: false });
  });

  it("ignores a value only one file uses", () => {
    const census = buildTagCensus([file(["blockchain"])], [], []);
    expect(census[0].suggested).toEqual({ tag: null, link: false });
    expect(tagActionKind(census[0].suggested)).toBe("ignore");
  });

  it("leaves an inline hashtag alone by default", () => {
    // It's prose, not a deliberate label — mapping one is opt-in.
    const census = buildTagCensus([file([], ["#Reading", "#Reading"]), file([], ["#Reading"])], [], []);
    expect(census[0].source).toBe("hashtag");
    expect(census[0].suggested).toEqual({ tag: null, link: false });
  });

  it("treats a value used as a real tag anywhere as a property, not a hashtag", () => {
    const census = buildTagCensus([file(["Reading"]), file([], ["#Reading"])], [], []);
    expect(census[0].source).toBe("property");
  });

  it("does not split a comma inside a reference", () => {
    const census = buildTagCensus([file(["[[Aug 26th, 2020]]"])], [], []);
    expect(census.map((entry) => entry.label)).toEqual(["Aug 26th, 2020"]);
  });
});

describe("tagNameWarning", () => {
  it("flags a name the tag: search prefix can't reach, with a suggestion", () => {
    expect(tagNameWarning("personal development")).toEqual({
      reason: "Spaces can't be used with the tag: search prefix",
      suggestion: "personal-development",
    });
  });

  it("is silent for a single word", () => {
    expect(tagNameWarning("meta")).toBeNull();
    expect(tagNameWarning("  meta  ")).toBeNull();
  });
});

describe("tagNamesToCreate", () => {
  it("lists only the new names, deduplicated case-insensitively", () => {
    const names = tagNamesToCreate([
      { tag: { createName: "meta" }, link: false },
      { tag: { createName: "Meta" }, link: true },
      { tag: { existingId: "tag-1" }, link: false },
      { tag: null, link: true },
    ]);
    expect(names).toEqual(["meta"]);
  });
});

describe("tagDecisionProblem", () => {
  it("catches a name that was cleared", () => {
    // A blank name creates nothing, so the value would be dropped from every page
    // carrying it without a word. The import step refuses to start on either of
    // these.
    expect(tagDecisionProblem({ tag: { createName: "" }, link: false })).toBe("empty");
    expect(tagDecisionProblem({ tag: { createName: "   " }, link: true })).toBe("empty");
  });

  it("catches a name the app's own search couldn't find", () => {
    // `tag:<name>` stops at a space, so "personal development" is untaggable in
    // search — the row offers a hyphenated name to take instead.
    expect(tagDecisionProblem({ tag: { createName: "personal development" }, link: false })).toBe("spaces");
    expect(tagDecisionProblem({ tag: { createName: "Books To Read" }, link: true })).toBe("spaces");
  });

  it("passes everything that would actually land", () => {
    expect(tagDecisionProblem({ tag: { createName: "meta" }, link: false })).toBeNull();
    expect(tagDecisionProblem({ tag: { createName: " tech " }, link: false })).toBeNull();
    // An existing tag's name isn't ours to judge, and link-only or ignore create
    // no tag at all — no name to get wrong.
    expect(tagDecisionProblem({ tag: { existingId: "tag-1" }, link: false })).toBeNull();
    expect(tagDecisionProblem({ tag: null, link: true })).toBeNull();
    expect(tagDecisionProblem({ tag: null, link: false })).toBeNull();
  });
});

describe("tagNameFor", () => {
  it("hyphenates a name the mapping screen never gets to show", () => {
    // A folder name, when folder tagging is on: the screen can't offer a fix for
    // it, so it gets the same treatment it insists on for every other new tag.
    expect(tagNameFor("Things To Write")).toBe("things-to-write");
    expect(tagNameFor("  Books  ")).toBe("Books");
  });
});
