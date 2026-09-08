/// <reference types="vitest/globals" />

/**
 * Logseq syntax → plain markdown. Fixtures are lifted from a real vault
 * (`pages/Books/Sapiens.md`, `pages/Home.md`, `pages/Knowledge.md`), because the
 * shapes that actually break a parser — a property whose value holds a comma, a
 * bullet carrying several paragraphs — aren't the ones you invent.
 */

import { describeNotes, normalizeLogseqMarkdown } from "@/lib/notes/import/logseq-normalize";

describe("page properties", () => {
  it("splits the leading property block off a real page", () => {
    const result = normalizeLogseqMarkdown(
      [
        "tags:: Books To Read, life, meta",
        "name:: Sapiens",
        "Author:: [[Yuval Noah Harari]]",
        "Date:: [[Jul 9th, 2018]] ",
        "Status:: #Reading",
        "",
        "- A note about the book",
      ].join("\n"),
    );

    expect(result.properties).toEqual([
      { key: "tags", value: "Books To Read, life, meta" },
      { key: "name", value: "Sapiens" },
      { key: "Author", value: "[[Yuval Noah Harari]]" },
      { key: "Date", value: "[[Jul 9th, 2018]]" },
      { key: "Status", value: "#Reading" },
    ]);
    expect(result.body).toBe("- A note about the book");
  });

  it("reads a property-only page and leaves an empty body", () => {
    const result = normalizeLogseqMarkdown("banner:: ../assets/photo.jpg\nicon:: 💡\n");
    expect(result.properties.map((p) => p.key)).toEqual(["banner", "icon"]);
    expect(result.body).toBe("");
  });

  it("takes a property written as the first bullet", () => {
    const result = normalizeLogseqMarkdown("- tags:: Awesome Thoughts\n- Real content");
    expect(result.properties).toEqual([{ key: "tags", value: "Awesome Thoughts" }]);
    expect(result.body).toBe("- Real content");
  });

  it("does not treat prose as a page property", () => {
    const result = normalizeLogseqMarkdown("- Some thought\ntags:: not a page property");
    expect(result.properties).toEqual([]);
    // Still stripped from the body: below the first block it's Logseq bookkeeping.
    expect(result.body).toBe("- Some thought");
  });

  it("strips block-level bookkeeping", () => {
    const result = normalizeLogseqMarkdown(
      ["- A bullet", "  id:: 664f1a2b-0000-4000-8000-000000000000", "  collapsed:: true", "- Another"].join("\n"),
    );
    expect(result.body).toBe("- A bullet\n- Another");
  });

  it("leaves a property-shaped line inside a code fence alone", () => {
    const result = normalizeLogseqMarkdown(["- Example", "  ```yaml", "  key:: value", "  ```"].join("\n"));
    expect(result.body).toContain("key:: value");
  });
});

describe("task markers", () => {
  it("maps open and closed markers to checkboxes", () => {
    const result = normalizeLogseqMarkdown(
      ["- TODO Buy milk", "- DOING Write draft", "- LATER Read paper", "- DONE Pay rent", "- CANCELED Old idea"].join("\n"),
    );
    expect(result.body.split("\n")).toEqual([
      "- [ ] Buy milk",
      "- [ ] Write draft",
      "- [ ] Read paper",
      "- [x] Pay rent",
      "- [x] Old idea",
    ]);
  });

  it("maps a nested marker and keeps its indentation", () => {
    const result = normalizeLogseqMarkdown("- Parent\n\t- TODO Child");
    expect(result.body).toBe("- Parent\n\t- [ ] Child");
  });

  it("keeps a priority marker as text and counts it", () => {
    const result = normalizeLogseqMarkdown("- TODO [#A] Urgent thing");
    expect(result.body).toBe("- [ ] [#A] Urgent thing");
    expect(result.notes).toEqual([{ kind: "priority", count: 1 }]);
  });

  it("leaves a bare word that only looks like a marker", () => {
    const result = normalizeLogseqMarkdown("- TODOS are piling up");
    expect(result.body).toBe("- TODOS are piling up");
  });
});

describe("macros and references", () => {
  it("turns embeds into plain links, as the real Home page needs", () => {
    const result = normalizeLogseqMarkdown(
      ["- {{embed [[Awesome Thoughts]]}}", "- {{embed [[Ideas]]}}", "- {{embed [[Courses]]}}"].join("\n"),
    );
    expect(result.body.split("\n")).toEqual(["- [[Awesome Thoughts]]", "- [[Ideas]]", "- [[Courses]]"]);
    expect(result.embedsLinked).toBe(3);
  });

  it("normalizes an image embed", () => {
    expect(normalizeLogseqMarkdown("- ![[assets/x.png]]").body).toBe("- ![](assets/x.png)");
  });

  it("keeps what it can't translate, and counts it", () => {
    const result = normalizeLogseqMarkdown(
      [
        "- {{query [[Books To Read]]}}",
        "- {{video https://youtube.com/shorts/abc}}",
        "- See ((664f1a2b-0000-4000-8000-000000000000))",
        "- Tagged #Notion and #Roam",
      ].join("\n"),
    );

    expect(result.body).toContain("{{query [[Books To Read]]}}");
    expect(result.body).toContain("((664f1a2b-0000-4000-8000-000000000000))");
    expect(Object.fromEntries(result.notes.map((n) => [n.kind, n.count]))).toEqual({
      query: 1,
      video: 1,
      blockRef: 1,
      hashtag: 2,
    });
  });

  it("does not count a heading as a hashtag", () => {
    const result = normalizeLogseqMarkdown("- ## Propositional Logic\n- #+BEGIN_QUOTE");
    expect(result.notes.find((n) => n.kind === "hashtag")).toBeUndefined();
    expect(result.notes.find((n) => n.kind === "orgBlock")?.count).toBe(1);
  });
});

describe("structure is left to the markdown parser", () => {
  it("preserves a bullet carrying several paragraphs, as Knowledge.md does", () => {
    const source = [
      "- **Knowledge-Based Agents**",
      "\t- These are agents that reason.",
      "\t  ",
      "\t  What does reasoning mean?",
      "\t  ",
      "\t  1. If it didn't rain, Harry visited Hagrid.",
      "- **Sentence**",
    ].join("\n");
    expect(normalizeLogseqMarkdown(source).body).toBe(source);
  });

  it("leaves dividers, tables and fences untouched", () => {
    const source = ["- ---", "- | a | b |", "  | --- | --- |", "- ```ts", "  const x = 1;", "  ```"].join("\n");
    expect(normalizeLogseqMarkdown(source).body).toBe(source);
  });

  it("normalizes CRLF", () => {
    expect(normalizeLogseqMarkdown("- one\r\n- two").body).toBe("- one\n- two");
  });
});

describe("describeNotes", () => {
  it("reads as a human summary", () => {
    expect(describeNotes([{ kind: "blockRef", count: 2 }, { kind: "query", count: 1 }])).toBe("2 block refs, 1 query");
  });

  it("is empty when there is nothing to flag", () => {
    expect(describeNotes([])).toBe("");
  });
});
