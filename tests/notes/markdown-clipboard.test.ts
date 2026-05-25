/// <reference types="vitest/globals" />

import { parseClipboardMarkdown, shouldReplaceOnMarkdownPaste } from "@/lib/notes/markdown-clipboard-blocks";
import { parseMarkdownListBlocks, parseStructuredMarkdownList } from "@/lib/notes/markdown-clipboard";
import { buildBlockClipboardBlocks, serializeBlockClipboardMarkdown } from "@/lib/notes/block-line-selection";
import { createNoteDocumentFromText } from "@/lib/notes/notes-content";

describe("markdown-clipboard", () => {
  function renderMarkdown(text: string) {
    return `<p>${text}</p>`;
  }

  function parseHtmlDocument(html: string) {
    const text = html.replace(/^<p>/, "").replace(/<\/p>$/, "");
    return createNoteDocumentFromText(text);
  }

  it("parses the nested pasted markdown case into parent and child items", () => {
    const markdown = `- ## Weekly Reading
	- [Design Notes](https://example.com/design-notes)
	- [Project Outline](https://example.com/project-outline)
	- [Research Summary](https://example.com/research-summary)
	- [Release Checklist](https://example.com/release-checklist)
	- [Team Decisions](https://example.com/team-decisions)
	- [Open Questions](https://example.com/open-questions)
	- [Implementation Plan](https://example.com/implementation-plan)
	- [Retrospective Draft](https://example.com/retrospective-draft)
-`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "## Weekly Reading",
        children: [
          {
            text: "[Design Notes](https://example.com/design-notes)",
            children: [],
          },
          {
            text: "[Project Outline](https://example.com/project-outline)",
            children: [],
          },
          {
            text: "[Research Summary](https://example.com/research-summary)",
            children: [],
          },
          {
            text: "[Release Checklist](https://example.com/release-checklist)",
            children: [],
          },
          {
            text: "[Team Decisions](https://example.com/team-decisions)",
            children: [],
          },
          {
            text: "[Open Questions](https://example.com/open-questions)",
            children: [],
          },
          {
            text: "[Implementation Plan](https://example.com/implementation-plan)",
            children: [],
          },
          {
            text: "[Retrospective Draft](https://example.com/retrospective-draft)",
            children: [],
          },
        ],
      },
      {
        text: "",
        children: [],
      },
    ]);
  });

  it("returns null when the pasted text is not a pure markdown list", () => {
    expect(parseStructuredMarkdownList("Heading\n- child")).toBeNull();
  });

  it("preserves thematic separators between list sections without adding blank blocks", () => {
    const markdown = `- ## Section One
	- [Item A](https://example.com/item-a)
	- [Item B](https://example.com/item-b)
-
---
- ## Section Two
	- [Item C](https://example.com/item-c)
-`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "## Section One",
        children: [
          {
            text: "[Item A](https://example.com/item-a)",
            children: [],
          },
          {
            text: "[Item B](https://example.com/item-b)",
            children: [],
          },
        ],
      },
      {
        text: "---",
        children: [],
      },
      {
        text: "## Section Two",
        children: [
          {
            text: "[Item C](https://example.com/item-c)",
            children: [],
          },
        ],
      },
      {
        text: "",
        children: [],
      },
    ]);
  });

  it("preserves thematic breaks as explicit items", () => {
    expect(parseStructuredMarkdownList("- Parent\n---\n- Next")).toEqual([
      {
        text: "Parent",
        children: [],
      },
      {
        text: "---",
        children: [],
      },
      {
        text: "Next",
        children: [],
      },
    ]);
  });

  it("preserves deeper nested subsections inside a pasted outline", () => {
    const markdown = `- ## Trees
	- ### Traversal
		- [Preorder Notes](https://example.com/preorder)
		- [Postorder Notes](https://example.com/postorder)
	- ### Search Trees
		- [Kth Element](https://example.com/kth-element)
-`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "## Trees",
        children: [
          {
            text: "### Traversal",
            children: [
              {
                text: "[Preorder Notes](https://example.com/preorder)",
                children: [],
              },
              {
                text: "[Postorder Notes](https://example.com/postorder)",
                children: [],
              },
            ],
          },
          {
            text: "### Search Trees",
            children: [
              {
                text: "[Kth Element](https://example.com/kth-element)",
                children: [],
              },
            ],
          },
        ],
      },
      {
        text: "",
        children: [],
      },
    ]);
  });

  it("preserves continuation paragraphs within a list item", () => {
    const markdown = `- Parent

  continuation paragraph

  - Child
- Next`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "Parent\n\ncontinuation paragraph",
        children: [
          {
            text: "Child",
            children: [],
          },
        ],
      },
      {
        text: "Next",
        children: [],
      },
    ]);
  });

  it("preserves fenced code blocks within a list item", () => {
    const markdown = "- Parent\n\n  ```ts\n  const value = 1\n  ```\n\n  - Child";

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "Parent\n\n```ts\nconst value = 1\n```",
        children: [
          {
            text: "Child",
            children: [],
          },
        ],
      },
    ]);
  });

  it("preserves ordered list nesting as structured children", () => {
    const markdown = `1. Parent
   1. First child
   2. Second child
2. Next`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "Parent",
        children: [
          {
            text: "First child",
            children: [],
          },
          {
            text: "Second child",
            children: [],
          },
        ],
      },
      {
        text: "Next",
        children: [],
      },
    ]);
  });

  it("preserves blockquotes inside list items", () => {
    const markdown = `- Parent

  > quoted line
  > second line

  - Child`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "Parent\n\n> quoted line\n> second line",
        children: [
          {
            text: "Child",
            children: [],
          },
        ],
      },
    ]);
  });

  it("preserves note references and inline tags without markdown escaping", () => {
    const markdown = "- [[Weekly Reading]] #research\n  - [[Design Notes]] #reference";

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "[[Weekly Reading]] #research",
        children: [
          {
            text: "[[Design Notes]] #reference",
            children: [],
          },
        ],
      },
    ]);
  });

  it("preserves task list markers within structured items", () => {
    const markdown = `- [ ] Todo
- [x] Done
  - Child`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "[ ] Todo",
        children: [],
      },
      {
        text: "[x] Done",
        children: [
          {
            text: "Child",
            children: [],
          },
        ],
      },
    ]);
  });

  it("round-trips copied child-root blocks with later sibling roots through markdown fallback", () => {
    const copiedBlocks = buildBlockClipboardBlocks(
      [
        { id: "a", parent_block_id: "parent", content: createNoteDocumentFromText("sffsfsf") },
        { id: "b", parent_block_id: "a", content: createNoteDocumentFromText("sfsfsfsf") },
        { id: "c", parent_block_id: "a", content: createNoteDocumentFromText("dgdgdgdg") },
        { id: "d", parent_block_id: "parent", content: createNoteDocumentFromText("dgdgd") },
        { id: "e", parent_block_id: null, content: createNoteDocumentFromText("dgdgdgd") },
      ],
      ["a", "b", "c", "d", "e"],
    );

    const markdown = serializeBlockClipboardMarkdown(copiedBlocks);
    const parsed = parseClipboardMarkdown(markdown, {
      renderMarkdown,
      parseHtmlDocument,
      createScaffoldDocument: createNoteDocumentFromText,
    });

    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.children).toHaveLength(2);
    expect(parsed[1]?.children).toHaveLength(0);
    expect(parsed[2]?.children).toHaveLength(0);
  });

  it("parses the reported multi-root pasted markdown shape without dropping later roots", () => {
    const markdown = [
      "- sffsfsf",
      "  - sfsfsfsf",
      "  - dgdgdgdg",
      "- dgdgd",
      "- dgdgdgd",
    ].join("\n");

    const parsed = parseClipboardMarkdown(markdown, {
      renderMarkdown,
      parseHtmlDocument,
      createScaffoldDocument: createNoteDocumentFromText,
    });

    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.children).toHaveLength(2);
    expect(parsed[1]?.children).toHaveLength(0);
    expect(parsed[2]?.children).toHaveLength(0);
  });

  it("preserves mixed loose and tight nested lists", () => {
    const markdown = `- Parent
  - Tight child

    continuation paragraph
  - Sibling child
- Next`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "Parent",
        children: [
          {
            text: "Tight child\n\ncontinuation paragraph",
            children: [],
          },
          {
            text: "Sibling child",
            children: [],
          },
        ],
      },
      {
        text: "Next",
        children: [],
      },
    ]);
  });

  it("preserves ordered list restarts as separate root items", () => {
    const markdown = `3. Third
4. Fourth
10. Tenth`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "Third",
        children: [],
      },
      {
        text: "Fourth",
        children: [],
      },
      {
        text: "Tenth",
        children: [],
      },
    ]);
  });

  it("preserves thematic breaks nested within list items", () => {
    const markdown = `- Parent
  - Child before
  - ***
  - Child after`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "Parent",
        children: [
          {
            text: "Child before",
            children: [],
          },
          {
            text: "---",
            children: [],
          },
          {
            text: "Child after",
            children: [],
          },
        ],
      },
    ]);
  });

  it("preserves mixed task and ordered nesting", () => {
    const markdown = `- [x] Checklist
  1. First step
  2. Second step
- [ ] Follow up`;

    expect(parseStructuredMarkdownList(markdown)).toEqual([
      {
        text: "[x] Checklist",
        children: [
          {
            text: "First step",
            children: [],
          },
          {
            text: "Second step",
            children: [],
          },
        ],
      },
      {
        text: "[ ] Follow up",
        children: [],
      },
    ]);
  });
});

describe("markdown-clipboard block conversion", () => {
  it("converts parsed structured markdown into note block inserts", () => {
    const markdown = `- Parent
  - Child
- [x] Done`;

    expect(
      parseMarkdownListBlocks(markdown, (text) => ({
        type: "doc",
        content: [{ type: "paragraph", content: text.length > 0 ? [{ type: "text", text }] : [] }],
      }))
    ).toEqual([
      {
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Parent" }] }],
        },
        children: [
          {
            content: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Child" }] }],
            },
            children: [],
          },
        ],
      },
      {
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "[x] Done" }] }],
        },
        children: [],
      },
    ]);
  });

  it("returns null for non-structured markdown in the block conversion path", () => {
    expect(
      parseMarkdownListBlocks("Heading\n- child", (text) => ({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      }))
    ).toBeNull();
  });
});

describe("markdown-clipboard document routing", () => {
  it("converts top-level headings and blockquotes through the document fallback path", () => {
    const markdown = `# Heading

> quoted line
> second line`;

    const parsed = parseClipboardMarkdown(markdown, {
      renderMarkdown: (text) => `html:${text}`,
      parseHtmlDocument: (html) => {
        if (html !== `html:${markdown}`) {
          return null;
        }

        return {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Heading" }],
            },
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "quoted line" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second line" }],
                },
              ],
            },
          ],
        };
      },
      createScaffoldDocument: (text) => ({
        type: "doc",
        content: [{ type: "paragraph", content: text.length > 0 ? [{ type: "text", text }] : [] }],
      }),
    });

    expect(parsed).toEqual([
      {
        content: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Heading" }],
            },
          ],
        },
        children: [],
      },
      {
        content: {
          type: "doc",
          content: [
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "quoted line" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second line" }],
                },
              ],
            },
          ],
        },
        children: [],
      },
    ]);
  });

  it("falls back to scaffolded per-line blocks for plain text", () => {
    const markdown = `first line
second line`;

    expect(
      parseClipboardMarkdown(markdown, {
        renderMarkdown: (text) => `html:${text}`,
        parseHtmlDocument: () => null,
        createScaffoldDocument: (text) => ({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        }),
      })
    ).toEqual([
      {
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "first line" }] }],
        },
        children: [],
      },
      {
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "second line" }] }],
        },
        children: [],
      },
    ]);
  });

  it("marks single heading and blockquote pastes as block replacements", () => {
    const headingBlocks = parseClipboardMarkdown("# Heading", {
      renderMarkdown: (text) => `html:${text}`,
      parseHtmlDocument: () => ({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Heading" }],
          },
        ],
      }),
      createScaffoldDocument: (text) => ({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      }),
    });

    const blockquoteBlocks = parseClipboardMarkdown("> quoted", {
      renderMarkdown: (text) => `html:${text}`,
      parseHtmlDocument: () => ({
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "quoted" }],
              },
            ],
          },
        ],
      }),
      createScaffoldDocument: (text) => ({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      }),
    });

    expect(shouldReplaceOnMarkdownPaste(headingBlocks)).toBe(true);
    expect(shouldReplaceOnMarkdownPaste(blockquoteBlocks)).toBe(true);
  });

  it("keeps single paragraph markdown pastes in inline insertion mode", () => {
    const paragraphBlocks = parseClipboardMarkdown("[label](https://example.com)", {
      renderMarkdown: (text) => `html:${text}`,
      parseHtmlDocument: () => ({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "label" }],
          },
        ],
      }),
      createScaffoldDocument: (text) => ({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      }),
    });

    expect(shouldReplaceOnMarkdownPaste(paragraphBlocks)).toBe(false);
  });

  it("preserves indented code blocks and text as children when using tab indentation", () => {
    const markdown = [
      "- From: [[Project Planning Notes]]",
      "-",
      "---",
      "- ## Section A",
      "\t- Description: \"This section covers the main implementation details.\"",
      "\t-",
      "---",
      "\t-",
      "\t  ```python",
      "\t  def hello():",
      "\t      name = \"world\"",
      "\t      return f\"Hello, {name}\"",
      "\t  ```",
      "-",
      "---",
    ].join("\n");

    const result = parseStructuredMarkdownList(markdown);
    expect(result).not.toBeNull();

    // "## Section A" should NOT contain --- in its text
    const sectionA = result!.find((item) => item.text.includes("## Section A"));
    expect(sectionA).toBeDefined();
    expect(sectionA!.text).toBe("## Section A");
    expect(sectionA!.children.length).toBeGreaterThanOrEqual(3);

    // The code block should be a child, not a top-level item
    const codeChild = sectionA!.children.find((child) => child.text.includes("```python"));
    expect(codeChild).toBeDefined();

    // The --- should be a separate child item, not merged into the heading
    const hrChild = sectionA!.children.find((child) => child.text === "---");
    expect(hrChild).toBeDefined();
  });
});