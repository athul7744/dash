/// <reference types="vitest/globals" />

/**
 * markdownToBlockNodes + looksLikeMarkdown. Many inputs here are ported from the
 * (removed) markdown-clipboard suite; they're re-asserted against the new
 * single-document schema (block / taskLine / nested block) instead of the old
 * `{text,children}` / NoteBlockInsert tree.
 */

import type { JSONContent } from "@tiptap/core";
import { markdownToBlockNodes, looksLikeMarkdown, clipboardMarkdown } from "@/lib/notes/editor/markdown-paste";

/** Minimal DataTransfer stub with the given clipboard flavors. */
function clipboard(flavors: Record<string, string>): DataTransfer {
  return { getData: (type: string) => flavors[type] ?? "" } as unknown as DataTransfer;
}

/** Compact view of a block node for readable assertions. */
type Sum = { kind: string; text: string; checked?: boolean; level?: number; children: Sum[] };

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  const content = Array.isArray(node.content) ? node.content : [];
  return content.map(textOf).join("");
}

function summarize(block: JSONContent): Sum {
  const content = Array.isArray(block.content) ? block.content : [];
  const [contentNode, ...children] = content;
  const node = contentNode ?? { type: "paragraph" };
  const sum: Sum = { kind: node.type ?? "?", text: textOf(node), children: children.map(summarize) };
  if (node.type === "taskLine") sum.checked = node.attrs?.checked === true;
  if (node.type === "heading") sum.level = node.attrs?.level as number;
  return sum;
}

function summarizeAll(markdown: string): Sum[] {
  return markdownToBlockNodes(markdown).map(summarize);
}

describe("markdownToBlockNodes — block types", () => {
  it("parses headings with clamped levels", () => {
    expect(summarizeAll("# One\n## Two\n###### Six")).toEqual([
      { kind: "heading", text: "One", level: 1, children: [] },
      { kind: "heading", text: "Two", level: 2, children: [] },
      { kind: "heading", text: "Six", level: 5, children: [] }, // h6 clamps to 5
    ]);
  });

  it("splits blank-line-separated paragraphs into separate blocks", () => {
    expect(summarizeAll("Para one\n\nPara two")).toEqual([
      { kind: "paragraph", text: "Para one", children: [] },
      { kind: "paragraph", text: "Para two", children: [] },
    ]);
  });

  it("maps bullet items to nested plain paragraph blocks", () => {
    expect(summarizeAll("- a\n  - b\n- c")).toEqual([
      { kind: "paragraph", text: "a", children: [{ kind: "paragraph", text: "b", children: [] }] },
      { kind: "paragraph", text: "c", children: [] },
    ]);
  });

  it("keeps ordered numbers as literal text", () => {
    expect(summarizeAll("1. First\n2. Second")).toEqual([
      { kind: "paragraph", text: "1. First", children: [] },
      { kind: "paragraph", text: "2. Second", children: [] },
    ]);
  });

  it("numbers ordered lists from their start value", () => {
    // CommonMark: consecutive ordered items count from the first marker (3).
    expect(summarizeAll("3. Third\n4. Fourth\n10. Tenth")).toEqual([
      { kind: "paragraph", text: "3. Third", children: [] },
      { kind: "paragraph", text: "4. Fourth", children: [] },
      { kind: "paragraph", text: "5. Tenth", children: [] },
    ]);
  });

  it("maps task items to taskLine blocks with checked state", () => {
    expect(summarizeAll("- [ ] Todo\n- [x] Done\n  - Child")).toEqual([
      { kind: "taskLine", text: "Todo", checked: false, children: [] },
      { kind: "taskLine", text: "Done", checked: true, children: [{ kind: "paragraph", text: "Child", children: [] }] },
    ]);
  });

  it("keeps a blank-line-separated multi-paragraph blockquote inside one block", () => {
    const [block] = markdownToBlockNodes("> para one\n>\n> para two");
    const quote = block.content![0];
    expect(quote.type).toBe("blockquote");
    expect(quote.content).toHaveLength(2);
    expect(quote.content!.map(textOf)).toEqual(["para one", "para two"]);
  });

  it("keeps soft-wrapped quote lines as one paragraph with a hard break", () => {
    const [block] = markdownToBlockNodes("> quoted line\n> second line");
    const quote = block.content![0];
    expect(quote.content).toHaveLength(1);
    const para = quote.content![0];
    expect(para.content!.some((n) => n.type === "hardBreak")).toBe(true);
    expect(textOf(para)).toBe("quoted linesecond line");
  });

  it("parses a fenced code block with its language", () => {
    const [block] = markdownToBlockNodes("```ts\nconst x = 1\n```");
    const code = block.content![0];
    expect(code.type).toBe("codeBlock");
    expect(code.attrs?.language).toBe("ts");
    expect(textOf(code)).toBe("const x = 1");
  });

  it("maps a thematic break to a horizontalRule block", () => {
    const [block] = markdownToBlockNodes("---");
    expect(block.content![0].type).toBe("horizontalRule");
  });

  it("maps a GFM table to a table block with header + cells", () => {
    const [block] = markdownToBlockNodes("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const table = block.content![0];
    expect(table.type).toBe("table");
    const rows = table.content!;
    expect(rows).toHaveLength(2);
    expect(rows[0].content!.map((c) => c.type)).toEqual(["tableHeader", "tableHeader"]);
    expect(rows[1].content!.map((c) => c.type)).toEqual(["tableCell", "tableCell"]);
    expect(rows[1].content!.map(textOf)).toEqual(["1", "2"]);
  });

  it("maps a standalone $$…$$ paragraph to a mathBlock", () => {
    const [block] = markdownToBlockNodes("$$E = mc^2$$");
    expect(block.content![0]).toEqual({ type: "mathBlock", attrs: { latex: "E = mc^2" } });
  });
});

describe("markdownToBlockNodes — inline marks", () => {
  function inlineOf(markdown: string): JSONContent[] {
    return markdownToBlockNodes(markdown)[0].content![0].content ?? [];
  }
  const marksOn = (nodes: JSONContent[], text: string) =>
    (nodes.find((n) => n.text === text)?.marks ?? []).map((m) => m.type);

  it("applies bold / italic / strike / code marks", () => {
    const nodes = inlineOf("**b** _i_ ~~s~~ `c`");
    expect(marksOn(nodes, "b")).toEqual(["bold"]);
    expect(marksOn(nodes, "i")).toEqual(["italic"]);
    expect(marksOn(nodes, "s")).toEqual(["strike"]);
    expect(marksOn(nodes, "c")).toEqual(["code"]);
  });

  it("applies a link mark with its href", () => {
    const nodes = inlineOf("[label](https://example.com)");
    const link = nodes.find((n) => n.text === "label");
    expect(link?.marks).toEqual([{ type: "link", attrs: { href: "https://example.com" } }]);
  });

  it("converts a hard break to a hardBreak node", () => {
    const nodes = inlineOf("line one  \nline two");
    expect(nodes.some((n) => n.type === "hardBreak")).toBe(true);
  });

  it("keeps [[refs]] and #tags as literal text", () => {
    expect(textOf(markdownToBlockNodes("[[Weekly Reading]] #research")[0].content![0])).toBe(
      "[[Weekly Reading]] #research",
    );
  });
});

describe("markdownToBlockNodes — ported fixtures", () => {
  it("nested outline: a heading item with link children", () => {
    const markdown = `- ## Weekly Reading
\t- [Design Notes](https://example.com/design-notes)
\t- [Project Outline](https://example.com/project-outline)`;
    const [root] = summarizeAll(markdown);
    expect(root.kind).toBe("heading");
    expect(root.text).toBe("Weekly Reading");
    expect(root.children.map((c) => c.text)).toEqual(["Design Notes", "Project Outline"]);
  });

  it("thematic separators between list sections become their own blocks", () => {
    const markdown = `- ## Section One
\t- [Item A](https://example.com/item-a)
---
- ## Section Two
\t- [Item C](https://example.com/item-c)`;
    const kinds = summarizeAll(markdown).map((b) => b.kind);
    expect(kinds).toContain("horizontalRule");
    const headings = summarizeAll(markdown).filter((b) => b.kind === "heading");
    expect(headings.map((h) => h.text)).toEqual(["Section One", "Section Two"]);
  });

  it("deeper nested subsections keep their depth", () => {
    const markdown = `- ## Trees
\t- ### Traversal
\t\t- [Preorder Notes](https://example.com/preorder)
\t- ### Search Trees`;
    const [trees] = summarizeAll(markdown);
    expect(trees.text).toBe("Trees");
    expect(trees.children.map((c) => c.text)).toEqual(["Traversal", "Search Trees"]);
    expect(trees.children[0].children.map((c) => c.text)).toEqual(["Preorder Notes"]);
  });

  it("continuation paragraphs nest as sibling child blocks", () => {
    const markdown = `- Parent

  continuation paragraph

  - Child
- Next`;
    const [parent, next] = summarizeAll(markdown);
    expect(parent.text).toBe("Parent");
    expect(parent.children.map((c) => c.text)).toEqual(["continuation paragraph", "Child"]);
    expect(next.text).toBe("Next");
  });

  it("fenced code inside a list item nests as a code child block", () => {
    const markdown = "- Parent\n\n  ```ts\n  const value = 1\n  ```\n\n  - Child";
    const [parent] = summarizeAll(markdown);
    expect(parent.text).toBe("Parent");
    expect(parent.children[0].kind).toBe("codeBlock");
    expect(parent.children[0].text).toBe("const value = 1");
    expect(parent.children[1].text).toBe("Child");
  });

  it("blockquotes inside list items nest as blockquote child blocks", () => {
    const markdown = `- Parent

  > quoted line
  > second line

  - Child`;
    const [parent] = summarizeAll(markdown);
    expect(parent.children[0].kind).toBe("blockquote");
    expect(parent.children[0].text).toBe("quoted linesecond line"); // soft break, no separator
  });

  it("ordered nesting keeps numbers on parent and children", () => {
    const markdown = `1. Parent
   1. First child
   2. Second child
2. Next`;
    const [parent, next] = summarizeAll(markdown);
    expect(parent.text).toBe("1. Parent");
    expect(parent.children.map((c) => c.text)).toEqual(["1. First child", "2. Second child"]);
    expect(next.text).toBe("2. Next");
  });

  it("multi-root bullet paste keeps every root", () => {
    const markdown = ["- sffsfsf", "  - sfsfsfsf", "  - dgdgdgdg", "- dgdgd", "- dgdgdgd"].join("\n");
    const roots = summarizeAll(markdown);
    expect(roots).toHaveLength(3);
    expect(roots[0].children).toHaveLength(2);
    expect(roots[1].children).toHaveLength(0);
    expect(roots[2].children).toHaveLength(0);
  });

  it("thematic breaks nested within list items become hr child blocks", () => {
    const markdown = `- Parent
  - Child before
  - ***
  - Child after`;
    const [parent] = summarizeAll(markdown);
    expect(parent.children.map((c) => c.kind)).toEqual(["paragraph", "horizontalRule", "paragraph"]);
    expect(parent.children.map((c) => c.text)).toEqual(["Child before", "", "Child after"]);
  });

  it("mixed task + ordered nesting", () => {
    const markdown = `- [x] Checklist
  1. First step
  2. Second step
- [ ] Follow up`;
    const [checklist, followUp] = summarizeAll(markdown);
    expect(checklist).toMatchObject({ kind: "taskLine", text: "Checklist", checked: true });
    expect(checklist.children.map((c) => c.text)).toEqual(["1. First step", "2. Second step"]);
    expect(followUp).toMatchObject({ kind: "taskLine", text: "Follow up", checked: false });
  });

  it("top-level heading followed by a blockquote splits into two blocks", () => {
    const [heading, quote] = summarizeAll("# Heading\n\n> quoted line\n> second line");
    expect(heading).toMatchObject({ kind: "heading", text: "Heading", level: 1 });
    expect(quote.kind).toBe("blockquote");
  });
});

describe("looksLikeMarkdown", () => {
  it.each([
    ["# Heading", true],
    ["- item\n- item", true],
    ["1. one\n2. two", true],
    ["- [ ] task", true],
    ["> quote", true],
    ["```\ncode\n```", true],
    ["---", true],
    ["| a | b |\n| --- | --- |\n| 1 | 2 |", true],
    ["see [label](https://example.com)", true],
    ["some **bold** text", true],
    ["math $$x^2$$ here", true],
  ])("detects markdown: %j", (input, expected) => {
    expect(looksLikeMarkdown(input)).toBe(expected);
  });

  it.each([
    ["", false],
    ["just a plain sentence", false],
    ["two plain\nlines of prose", false],
    ["costs $5 and $10 total", false],
  ])("leaves prose alone: %j", (input, expected) => {
    expect(looksLikeMarkdown(input)).toBe(expected);
  });
});

describe("clipboardMarkdown routing", () => {
  it("returns null when there is no clipboard", () => {
    expect(clipboardMarkdown(null)).toBeNull();
  });

  it("prefers an explicit text/markdown flavor", () => {
    expect(clipboardMarkdown(clipboard({ "text/markdown": "# Title", "text/plain": "Title" }))).toBe("# Title");
  });

  it("parses markdown-looking plain text", () => {
    expect(clipboardMarkdown(clipboard({ "text/plain": "- a\n- b" }))).toBe("- a\n- b");
  });

  it("leaves non-markdown plain text to native paste", () => {
    expect(clipboardMarkdown(clipboard({ "text/plain": "just prose" }))).toBeNull();
  });

  it("leaves structured rich HTML to native paste even if the plain text looks like markdown", () => {
    const flavors = { "text/plain": "- a\n- b", "text/html": "<ul><li>a</li><li>b</li></ul>" };
    expect(clipboardMarkdown(clipboard(flavors))).toBeNull();
  });

  it("still parses markdown when the HTML is only a bare text wrapper", () => {
    const flavors = { "text/plain": "# Heading", "text/html": "<div>## Heading</div>" };
    expect(clipboardMarkdown(clipboard(flavors))).toBe("# Heading");
  });
});
