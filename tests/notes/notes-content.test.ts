/// <reference types="vitest/globals" />

import {
  createEmptyNoteDocument,
  createNoteDocumentFromText,
  extractNoteText,
  getNoteDocumentEndSelection,
  mergeNoteDocuments,
  normalizeNoteDocument,
  serializeNoteDocument,
  serializeNoteDocumentToMarkdown,
} from "@/lib/notes/notes-content";

describe("notes-content", () => {
  it("normalizes empty values to an empty note document", () => {
    expect(normalizeNoteDocument(null)).toEqual(createEmptyNoteDocument());
    expect(normalizeNoteDocument(undefined)).toEqual(createEmptyNoteDocument());
    expect(normalizeNoteDocument("")).toEqual(createEmptyNoteDocument());
  });

  it("preserves valid note documents", () => {
    const document = createNoteDocumentFromText("Hello world");
    expect(normalizeNoteDocument(document)).toEqual(document);
  });

  it("repairs double-encoded note documents", () => {
    const document = createNoteDocumentFromText("Recovered");
    const doubleEncodedDocument = JSON.stringify(JSON.stringify(document));

    expect(normalizeNoteDocument(doubleEncodedDocument)).toEqual(document);
  });

  it("falls back to a plain text document for legacy text content", () => {
    expect(normalizeNoteDocument("Legacy block")).toEqual(createNoteDocumentFromText("Legacy block"));
  });

  it("serializes to a single-encoded document string", () => {
    const document = createNoteDocumentFromText("Single encode");
    expect(serializeNoteDocument(document)).toBe(JSON.stringify(document));
  });

  it("extracts plain text across nested note content", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "One" },
            { type: "text", text: "Two" },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Three" }],
        },
      ],
    };

    expect(extractNoteText(document)).toBe("One Two Three");
  });

  it("merges into an effectively empty previous paragraph without keeping a blank node", () => {
    expect(
      mergeNoteDocuments(
        { type: "doc", content: [{ type: "paragraph" }] },
        createNoteDocumentFromText("Next")
      )
    ).toEqual(createNoteDocumentFromText("Next"));
  });

  it("preserves a previous non-paragraph trailing node instead of inline joining", () => {
    expect(
      mergeNoteDocuments(
        {
          type: "doc",
          content: [{ type: "horizontalRule" }],
        },
        createNoteDocumentFromText("Next")
      )
    ).toEqual({
      type: "doc",
      content: [
        { type: "horizontalRule" },
        { type: "paragraph", content: [{ type: "text", text: "Next" }] },
      ],
    });
  });

  it("preserves task list content when merging a later paragraph block", () => {
    expect(
      mergeNoteDocuments(
        {
          type: "doc",
          content: [
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Todo" }] }],
                },
              ],
            },
          ],
        },
        createNoteDocumentFromText("Next")
      )
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Todo" }] }],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Next" }] },
      ],
    });
  });

  it("preserves code block content when merging a later paragraph block", () => {
    expect(
      mergeNoteDocuments(
        {
          type: "doc",
          content: [
            {
              type: "codeBlock",
              attrs: { language: null },
              content: [{ type: "text", text: "const value = 1" }],
            },
          ],
        },
        createNoteDocumentFromText("Next")
      )
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const value = 1" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Next" }] },
      ],
    });
  });

  it("preserves table content when merging a later paragraph block", () => {
    expect(
      mergeNoteDocuments(
        {
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
                  ],
                },
              ],
            },
          ],
        },
        createNoteDocumentFromText("Next")
      )
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
              ],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Next" }] },
      ],
    });
  });

  it("merges a paragraph inline into a heading, preserving heading type and attrs", () => {
    expect(
      mergeNoteDocuments(
        {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Title" }],
            },
          ],
        },
        createNoteDocumentFromText("Next")
      )
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [
            { type: "text", text: "Title" },
            { type: "text", text: "Next" },
          ],
        },
      ],
    });
  });

  it("merges a heading inline into a paragraph, preserving paragraph type", () => {
    expect(
      mergeNoteDocuments(
        createNoteDocumentFromText("Before"),
        {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 3 },
              content: [{ type: "text", text: "Title" }],
            },
          ],
        }
      )
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Before" },
            { type: "text", text: "Title" },
          ],
        },
      ],
    });
  });

  it("serializes mathInline nodes to $latex$ in markdown", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The formula " },
            { type: "mathInline", attrs: { latex: "E=mc^2" } },
            { type: "text", text: " is famous." },
          ],
        },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("The formula $E=mc^2$ is famous.");
  });

  it("serializes mathBlock nodes to $$latex$$ in markdown", () => {
    const document = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Consider:" }] },
        { type: "mathBlock", attrs: { latex: "\\int_0^1 x^2 dx" } },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("Consider:\n\n$$\\int_0^1 x^2 dx$$");
  });

  it("serializes multiple mathInline nodes in one paragraph", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mathInline", attrs: { latex: "a" } },
            { type: "text", text: " + " },
            { type: "mathInline", attrs: { latex: "b" } },
            { type: "text", text: " = " },
            { type: "mathInline", attrs: { latex: "c" } },
          ],
        },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("$a$ + $b$ = $c$");
  });

  it("serializes mathInline with complex LaTeX including backslashes", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Drops time to " },
            { type: "mathInline", attrs: { latex: "O(\\alpha)" } },
            { type: "text", text: " -> effectively amortized." },
          ],
        },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("Drops time to $O(\\alpha)$ -> effectively amortized.");
  });

  it("serializes mathInline with empty latex as empty string", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "before " },
            { type: "mathInline", attrs: { latex: "" } },
            { type: "text", text: " after" },
          ],
        },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("before  after");
  });

  it("serializes mathBlock with empty latex as empty string", () => {
    const document = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "mathBlock", attrs: { latex: "" } },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("Before\n\nAfter");
  });

  it("serializes mathBlock between paragraphs", () => {
    const document = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Given:" }] },
        { type: "mathBlock", attrs: { latex: "\\sum_{i=0}^{n} i = \\frac{n(n+1)}{2}" } },
        { type: "paragraph", content: [{ type: "text", text: "We conclude." }] },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe(
      "Given:\n\n$$\\sum_{i=0}^{n} i = \\frac{n(n+1)}{2}$$\n\nWe conclude."
    );
  });

  it("serializes mathInline inside a heading", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [
            { type: "text", text: "Proof of " },
            { type: "mathInline", attrs: { latex: "P = NP" } },
          ],
        },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("## Proof of $P = NP$");
  });

  it("serializes mathInline inside a blockquote", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Where " },
                { type: "mathInline", attrs: { latex: "e^{i\\pi} + 1 = 0" } },
              ],
            },
          ],
        },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("> Where $e^{i\\pi} + 1 = 0$");
  });

  it("serializes single-block taskLine nodes as checkbox markdown", () => {
    const document = {
      type: "doc",
      content: [
        { type: "taskLine", attrs: { checked: true }, content: [{ type: "text", text: "Done" }] },
        { type: "taskLine", attrs: { checked: false }, content: [{ type: "text", text: "Pending" }] },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("- [x] Done\n\n- [ ] Pending");
    expect(extractNoteText(document)).toBe("Done Pending");
  });
});

describe("getNoteDocumentEndSelection", () => {
  it("returns 1 for an empty document", () => {
    expect(getNoteDocumentEndSelection(null)).toBe(1);
    expect(getNoteDocumentEndSelection({ type: "doc", content: [{ type: "paragraph" }] })).toBe(1);
  });

  it("returns correct position for a single paragraph with text", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
    // paragraph node: content(5) + 2 border = 7, doc total = 7, result = max(1, 7-1) = 6
    expect(getNoteDocumentEndSelection(doc)).toBe(6);
  });

  it("returns correct position for multiple paragraphs", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "ab" }] },
        { type: "paragraph", content: [{ type: "text", text: "cd" }] },
      ],
    };
    // Each paragraph: content(2) + 2 = 4, total = 8, result = max(1, 8-1) = 7
    expect(getNoteDocumentEndSelection(doc)).toBe(7);
  });

  it("handles a heading with text", () => {
    const doc = { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Title" }] }] };
    // heading: content(5) + 2 = 7, result = max(1, 7-1) = 6
    expect(getNoteDocumentEndSelection(doc)).toBe(6);
  });
});