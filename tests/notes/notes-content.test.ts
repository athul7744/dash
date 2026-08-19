/// <reference types="vitest/globals" />

import {
  createEmptyNoteDocument,
  createNoteDocumentFromText,
  extractNoteText,
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

  it("serializes an image url to markdown", () => {
    const document = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.com/a.png", alt: "A photo" } }],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("![A photo](https://example.com/a.png)");
  });

  it("serializes a stored image as an attachment reference", () => {
    const document = {
      type: "doc",
      content: [{ type: "image", attrs: { attachmentId: "att-1", alt: "Shot" } }],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("![Shot](attachment:att-1)");
  });

  it("prefers the original url over the attachment reference once adopted", () => {
    const document = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.com/a.png", attachmentId: "att-1" } }],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("![](https://example.com/a.png)");
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

  it("serializes a dateToken atom as its plain date, and surfaces its token in text", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Due " },
            { type: "dateToken", attrs: { date: "Jul 23, 2026" } },
          ],
        },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("Due Jul 23, 2026");
    expect(extractNoteText(document)).toBe("Due {Jul 23, 2026}");
  });

  it("escapes a pipe inside a table cell so columns don't shift on re-parse", () => {
    const cell = (text: string, type = "tableCell") => ({
      type,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const document = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("A", "tableHeader"), cell("B", "tableHeader")] },
            { type: "tableRow", content: [cell("a|b"), cell("c")] },
          ],
        },
      ],
    };
    expect(serializeNoteDocumentToMarkdown(document)).toBe("| A | B |\n| --- | --- |\n| a\\|b | c |");
  });
});