/// <reference types="vitest/globals" />

/**
 * Markdown paste against the real editor schema. Verifies parsed markdown
 * inserts as schema-valid nodes (nodeFromJSON never throws), the normalizer
 * keeps one content node per block, ids get stamped, and the single-paragraph
 * fast path merges inline instead of splitting the line.
 */

import { Editor } from "@tiptap/core";
import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import Code from "@tiptap/extension-code";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import History from "@tiptap/extension-history";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Text from "@tiptap/extension-text";
import { common, createLowlight } from "lowlight";

import { CodeBlockWithToolbar } from "@/components/notes/NoteBlockEditorCode";
import { MarkdownLink, NotesHorizontalRule } from "@/components/notes/NoteBlockEditorExtensions";
import { MathBlock, MathInline } from "@/components/notes/NoteBlockEditorMath";
import { TaskLine } from "@/components/notes/editor/TaskLineNode";
import { NotesDocument, BlockNode, asBlockContent, BLOCK_CONTENT_GROUP } from "@/lib/notes/editor/block-schema";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { BlockNormalize } from "@/lib/notes/editor/block-normalize";
import { insertMarkdown, pasteUrlAsLink } from "@/lib/notes/editor/markdown-paste";
import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

// Production extension list minus the QueryBlock node (its NodeView imports the
// PowerSync db, which needs a Worker jsdom lacks). The schema is otherwise
// identical, which is what these paste-shape assertions exercise.
function noteExtensions() {
  const lowlight = createLowlight(common);
  const Table_ = Table.configure({ resizable: false });
  return [
    NotesDocument,
    BlockNode,
    asBlockContent(Paragraph),
    asBlockContent(Heading.configure({ levels: [1, 2, 3, 4, 5] })),
    asBlockContent(Blockquote.extend({ content: `${BLOCK_CONTENT_GROUP}+` })),
    asBlockContent(CodeBlockWithToolbar.configure({ lowlight })),
    asBlockContent(Image),
    asBlockContent(NotesHorizontalRule),
    asBlockContent(Table_),
    asBlockContent(MathBlock),
    TaskLine,
    Text,
    Bold,
    Italic,
    Strike,
    Code,
    HardBreak,
    MathInline,
    TableRow,
    TableHeader.extend({ content: `${BLOCK_CONTENT_GROUP}+` }),
    TableCell.extend({ content: `${BLOCK_CONTENT_GROUP}+` }),
    MarkdownLink,
    History,
    BlockIdPlugin,
    BlockNormalize,
  ];
}

function row(id: string, text: string): BlockDocumentRow {
  return {
    id,
    parent_block_id: null,
    sort_rank: "a",
    type: "text",
    content: serializeNoteDocument({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] }),
  };
}

function makeEditor(rows: BlockDocumentRow[]): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: noteExtensions(),
    content: assembleDoc(rows) as never,
  });
}

function frankenblockCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "block") {
      let contentNodes = 0;
      node.forEach((child) => {
        if (child.type.name !== "block") contentNodes += 1;
      });
      if (contentNodes > 1) count += 1;
    }
    return true;
  });
  return count;
}

/** Insert markdown at the end of the document, as a paste there would. */
function pasteAtEnd(editor: Editor, markdown: string): boolean {
  editor.commands.setTextSelection(editor.state.doc.content.size);
  return insertMarkdown(editor.view, markdown);
}

describe("markdown paste (live schema)", () => {
  it("inserts a mixed markdown document as well-formed blocks", () => {
    const editor = makeEditor([row("b1", "Start")]);
    const markdown = [
      "# Heading",
      "",
      "A paragraph.",
      "",
      "- bullet one",
      "  - nested bullet",
      "- [ ] a task",
      "- [x] done task",
      "",
      "> a quote",
      "",
      "```ts",
      "const x = 1",
      "```",
      "",
      "---",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n");

    expect(pasteAtEnd(editor, markdown)).toBe(true);

    // No node failed schema validation, and no block holds >1 content node.
    expect(frankenblockCount(editor)).toBe(0);

    const blocks = decomposeDoc(editor.getJSON());
    for (const b of blocks) {
      expect(JSON.parse(b.content).content.length).toBe(1);
      expect(b.blockId).not.toBe(""); // BlockIdPlugin stamped every block
    }

    const types = blocks.map((b) => JSON.parse(b.content).content[0].type);
    expect(types).toContain("heading");
    expect(types).toContain("taskLine");
    expect(types).toContain("codeBlock");
    expect(types).toContain("horizontalRule");
    expect(types).toContain("table");
    // The two task rows are typed "task" from their content.
    expect(blocks.filter((b) => b.type === "task")).toHaveLength(2);

    const text = editor.getText();
    expect(text).toContain("Heading");
    expect(text).toContain("nested bullet");

    editor.destroy();
  });

  it("stamps fresh unique ids on every pasted block", () => {
    const editor = makeEditor([row("b1", "Start")]);
    pasteAtEnd(editor, "- one\n- two\n- three");
    const ids = decomposeDoc(editor.getJSON()).map((b) => b.blockId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    editor.destroy();
  });

  it("merges a single inline-formatted paragraph into the current line", () => {
    const editor = makeEditor([row("b1", "Hello ")]);
    // Cursor at end of "Hello ".
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    const inserted = insertMarkdown(editor.view, "**bold** world");
    expect(inserted).toBe(true);

    const blocks = decomposeDoc(editor.getJSON());
    // No new block created — the inline content merged into b1.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].blockId).toBe("b1");
    const inline = JSON.parse(blocks[0].content).content[0].content;
    const bold = inline.find((n: { text?: string }) => n.text === "bold");
    expect(bold.marks).toEqual([{ type: "bold" }]);
    expect(editor.getText()).toContain("Hello bold world");

    editor.destroy();
  });
});

/** All (text, href) pairs carrying a link mark, in document order. */
function linkMarks(editor: Editor): Array<{ text: string; href: string }> {
  const out: Array<{ text: string; href: string }> = [];
  editor.state.doc.descendants((node) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === "link");
    if (mark) out.push({ text: node.text ?? "", href: String(mark.attrs.href) });
  });
  return out;
}

function rangeOf(editor: Editor, needle: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return;
    const i = node.text.indexOf(needle);
    if (i >= 0) found = { from: pos + i, to: pos + i + needle.length };
  });
  return found;
}

describe("paste bare URL as link", () => {
  it("inserts a linked URL at the cursor", () => {
    const editor = makeEditor([row("b1", "see ")]);
    editor.commands.setTextSelection(editor.state.doc.content.size);
    expect(pasteUrlAsLink(editor.view, "https://example.com")).toBe(true);

    const links = linkMarks(editor);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ text: "https://example.com", href: "https://example.com" });
    editor.destroy();
  });

  it("normalizes a bare domain to https", () => {
    const editor = makeEditor([row("b1", "")]);
    editor.commands.setTextSelection(editor.state.doc.content.size);
    expect(pasteUrlAsLink(editor.view, "example.com")).toBe(true);
    expect(linkMarks(editor)[0].href).toBe("https://example.com");
    editor.destroy();
  });

  it("wraps the current selection instead of inserting the URL text", () => {
    const editor = makeEditor([row("b1", "click here")]);
    const range = rangeOf(editor, "here")!;
    editor.commands.setTextSelection(range);
    expect(pasteUrlAsLink(editor.view, "https://example.com")).toBe(true);

    const links = linkMarks(editor);
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe("here");
    expect(links[0].href).toBe("https://example.com");
    expect(editor.getText()).toContain("click here"); // text unchanged
    editor.destroy();
  });

  it("ignores non-URL text so native paste can run", () => {
    const editor = makeEditor([row("b1", "x")]);
    editor.commands.setTextSelection(editor.state.doc.content.size);
    expect(pasteUrlAsLink(editor.view, "just some prose")).toBe(false);
    expect(linkMarks(editor)).toHaveLength(0);
    editor.destroy();
  });

  it("does not leave the link mark stored for subsequent typing", () => {
    const editor = makeEditor([row("b1", "")]);
    editor.commands.setTextSelection(editor.state.doc.content.size);
    pasteUrlAsLink(editor.view, "https://example.com");
    editor.commands.insertContent(" after");

    const links = linkMarks(editor);
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe("https://example.com"); // " after" is not linked
    editor.destroy();
  });
});
