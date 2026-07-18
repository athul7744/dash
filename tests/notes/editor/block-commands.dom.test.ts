/// <reference types="vitest/globals" />

/** Native block structural commands, verified through a live editor. */

import { LexoRank } from "lexorank";
import { Editor } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import CodeBlock from "@tiptap/extension-code-block";
import Blockquote from "@tiptap/extension-blockquote";
import History from "@tiptap/extension-history";
import { NodeSelection } from "@tiptap/pm/state";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { TaskLine } from "@/components/notes/editor/TaskLineNode";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { splitBlock, indentBlock, outdentBlock, mergeBlockBackward, moveBlockUp, moveBlockDown, type BlockCommand } from "@/lib/notes/editor/block-commands";
import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

const RANK_0 = LexoRank.middle().format();
const RANK_1 = LexoRank.middle().genNext().format();

function docContent(text: string): string {
  return serializeNoteDocument({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });
}
function row(id: string, text: string, over: Partial<BlockDocumentRow> = {}): BlockDocumentRow {
  return { id, parent_block_id: null, sort_rank: RANK_0, type: "text", content: docContent(text), ...over };
}

function makeEditor(rows: BlockDocumentRow[]): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [NotesDocument, BlockNode, asBlockContent(Paragraph), asBlockContent(Heading.configure({ levels: [1, 2, 3] })), asBlockContent(HorizontalRule), asBlockContent(CodeBlock), asBlockContent(Blockquote.extend({ content: "blockContent+" })), TaskLine, Text, History, BlockIdPlugin],
    content: assembleDoc(rows) as never,
  });
}

function run(editor: Editor, command: BlockCommand): boolean {
  return command(editor.state, editor.view.dispatch.bind(editor.view));
}

/** Position of the text inside the first block whose text equals `text`. */
function cursorInBlock(editor: Editor, text: string, offsetFromStart: number) {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos === -1 && node.isText && node.text === text) pos = p;
  });
  editor.commands.setTextSelection(pos + offsetFromStart);
}

/** Place the cursor inside the first text line (paragraph/heading/taskLine). */
function cursorInFirstParagraph(editor: Editor) {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos === -1 && node.isTextblock) pos = p + 1;
  });
  editor.commands.setTextSelection(pos);
}

function taskRow(id: string, text: string, over: Partial<BlockDocumentRow> = {}): BlockDocumentRow {
  return {
    id, parent_block_id: null, sort_rank: RANK_0, type: "task",
    content: serializeNoteDocument({ type: "doc", content: [{ type: "taskLine", attrs: { checked: false }, content: text ? [{ type: "text", text }] : [] }] }),
    ...over,
  };
}

describe("block structural commands", () => {
  it("splits a block into two siblings at the cursor, giving the new block a fresh id", () => {
    const editor = makeEditor([row("b1", "HelloWorld")]);
    cursorInBlock(editor, "HelloWorld", 5); // between "Hello" and "World"
    expect(run(editor, splitBlock)).toBe(true);

    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(2);
    expect(blocks.map((b) => b.parentId)).toEqual([null, null]);
    // Original keeps its id; the new sibling gets a distinct one.
    expect(blocks[0].blockId).toBe("b1");
    expect(blocks[1].blockId).not.toBe("b1");
    expect(blocks[1].blockId.length).toBeGreaterThan(0);
    expect(editor.getText()).toContain("Hello");
    expect(editor.getText()).toContain("World");
    editor.destroy();
  });

  it("indents a block to become the last child of its previous sibling", () => {
    const editor = makeEditor([row("b1", "First"), row("b2", "Second", { sort_rank: RANK_1 })]);
    cursorInBlock(editor, "Second", 1);
    expect(run(editor, indentBlock)).toBe(true);

    const blocks = decomposeDoc(editor.getJSON());
    const b2 = blocks.find((b) => b.blockId === "b2")!;
    expect(b2.parentId).toBe("b1");
    editor.destroy();
  });

  it("does not indent the first block (no previous sibling block)", () => {
    const editor = makeEditor([row("b1", "First"), row("b2", "Second", { sort_rank: RANK_1 })]);
    cursorInBlock(editor, "First", 1);
    expect(run(editor, indentBlock)).toBe(false);
    editor.destroy();
  });

  it("outdents a nested block to sit after its parent", () => {
    const editor = makeEditor([row("b1", "First"), row("b2", "Second", { sort_rank: RANK_1 })]);
    // First nest b2 under b1.
    cursorInBlock(editor, "Second", 1);
    run(editor, indentBlock);
    expect(decomposeDoc(editor.getJSON()).find((b) => b.blockId === "b2")!.parentId).toBe("b1");

    // Then outdent it back to the root, after b1.
    cursorInBlock(editor, "Second", 1);
    expect(run(editor, outdentBlock)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.find((b) => b.blockId === "b2")!.parentId).toBe(null);
    expect(blocks.map((b) => b.blockId)).toEqual(["b1", "b2"]);
    editor.destroy();
  });

  it("does not outdent a root block", () => {
    const editor = makeEditor([row("b1", "First")]);
    cursorInBlock(editor, "First", 1);
    expect(run(editor, outdentBlock)).toBe(false);
    editor.destroy();
  });

  it("merges a block into the previous sibling on Backspace at its start", () => {
    const editor = makeEditor([row("b1", "Hello"), row("b2", "World", { sort_rank: RANK_1 })]);
    cursorInBlock(editor, "World", 0); // very start of b2
    expect(run(editor, mergeBlockBackward)).toBe(true);

    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(1);
    expect(blocks[0].blockId).toBe("b1"); // survivor keeps its id
    expect(editor.getText()).toContain("HelloWorld");
    editor.destroy();
  });

  it("outdents (does not merge) a nested block on Backspace at its start", () => {
    const editor = makeEditor([row("b1", "First"), row("b2", "Second", { sort_rank: RANK_1 })]);
    cursorInBlock(editor, "Second", 1);
    run(editor, indentBlock); // nest b2 under b1
    cursorInBlock(editor, "Second", 0);
    expect(run(editor, mergeBlockBackward)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(2);
    expect(blocks.find((b) => b.blockId === "b2")!.parentId).toBe(null);
    editor.destroy();
  });

  it("does not merge when the cursor is not at the block start", () => {
    const editor = makeEditor([row("b1", "Hello"), row("b2", "World", { sort_rank: RANK_1 })]);
    cursorInBlock(editor, "World", 2); // mid-text
    expect(run(editor, mergeBlockBackward)).toBe(false);
    editor.destroy();
  });

  it("moves a block up and down among its siblings", () => {
    const editor = makeEditor([
      row("b1", "One"),
      row("b2", "Two", { sort_rank: RANK_1 }),
      row("b3", "Three", { sort_rank: LexoRank.middle().genNext().genNext().format() }),
    ]);
    cursorInBlock(editor, "Two", 1);
    expect(run(editor, moveBlockUp)).toBe(true);
    expect(decomposeDoc(editor.getJSON()).map((b) => b.blockId)).toEqual(["b2", "b1", "b3"]);

    cursorInBlock(editor, "Two", 1);
    expect(run(editor, moveBlockDown)).toBe(true);
    expect(decomposeDoc(editor.getJSON()).map((b) => b.blockId)).toEqual(["b1", "b2", "b3"]);
    editor.destroy();
  });

  it("does not move the first block up or the last block down", () => {
    const editor = makeEditor([row("b1", "One"), row("b2", "Two", { sort_rank: RANK_1 })]);
    cursorInBlock(editor, "One", 1);
    expect(run(editor, moveBlockUp)).toBe(false);
    cursorInBlock(editor, "Two", 1);
    expect(run(editor, moveBlockDown)).toBe(false);
    editor.destroy();
  });

  it("splits into a first-child block when the current block has children", () => {
    const editor = makeEditor([row("b1", "Parent"), row("b2", "Child", { sort_rank: RANK_1 })]);
    // Nest b2 under b1, then split at the end of b1's line.
    cursorInBlock(editor, "Child", 1);
    run(editor, indentBlock);
    cursorInBlock(editor, "Parent", 6); // end of "Parent"
    expect(run(editor, splitBlock)).toBe(true);

    const blocks = decomposeDoc(editor.getJSON());
    // New empty block is the FIRST child of b1 (right under the parent line).
    const b1Children = blocks.filter((b) => b.parentId === "b1");
    expect(b1Children.length).toBe(2);
    expect(b1Children[0].blockId).not.toBe("b2"); // the fresh block comes first
    editor.destroy();
  });

  it("keeps the heading when splitting mid-heading, drops it at end-of-heading", () => {
    const headingRow = (id: string, text: string, over: Partial<BlockDocumentRow> = {}): BlockDocumentRow => ({
      id, parent_block_id: null, sort_rank: RANK_0, type: "text",
      content: serializeNoteDocument({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] }] }),
      ...over,
    });

    // Mid-heading → both halves stay heading, preserving attrs (level).
    const mid = makeEditor([headingRow("h1", "TitleTail")]);
    cursorInBlock(mid, "TitleTail", 5);
    run(mid, splitBlock);
    const midBlocks = decomposeDoc(mid.getJSON());
    expect(JSON.parse(midBlocks[0].content).content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(JSON.parse(midBlocks[1].content).content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    mid.destroy();

    // End-of-heading → new block is a paragraph.
    const end = makeEditor([headingRow("h1", "Title")]);
    cursorInBlock(end, "Title", 5);
    run(end, splitBlock);
    const endBlocks = decomposeDoc(end.getJSON());
    expect(JSON.parse(endBlocks[0].content).content[0].type).toBe("heading");
    expect(JSON.parse(endBlocks[1].content).content[0].type).toBe("paragraph");
    end.destroy();
  });

  it("lifts children (no orphaning) when merging a parent block backward", () => {
    // b1, then b2 with a nested child b3; Backspace at start of b2 merges b2's
    // text into b1 and lifts b3 to b2's old position.
    const editor = makeEditor([row("b1", "Alpha"), row("b2", "Beta", { sort_rank: RANK_1 }), row("b3", "Gamma", { sort_rank: LexoRank.middle().genNext().genNext().format() })]);
    cursorInBlock(editor, "Gamma", 1);
    run(editor, indentBlock); // nest b3 under b2
    expect(decomposeDoc(editor.getJSON()).find((b) => b.blockId === "b3")!.parentId).toBe("b2");

    cursorInBlock(editor, "Beta", 0);
    expect(run(editor, mergeBlockBackward)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.map((b) => b.blockId).sort()).toEqual(["b1", "b3"]); // b2 gone
    expect(editor.getText()).toContain("AlphaBeta");
    // b3 lifted to the root (not orphaned, not lost).
    expect(blocks.find((b) => b.blockId === "b3")!.parentId).toBe(null);
    editor.destroy();
  });

  it("Enter at the start of a non-empty line pushes an empty block above", () => {
    const editor = makeEditor([row("b1", "Hello")]);
    cursorInBlock(editor, "Hello", 0);
    expect(run(editor, splitBlock)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(2);
    // b1 (with its text + id) is pushed down; a fresh empty block sits above it.
    expect(blocks[1].blockId).toBe("b1");
    expect(JSON.parse(blocks[0].content).content[0].content ?? []).toEqual([]);
    editor.destroy();
  });

  it("resets an empty heading to a paragraph on Backspace", () => {
    const editor = makeEditor([
      { id: "b1", parent_block_id: null, sort_rank: RANK_0, type: "text",
        content: serializeNoteDocument({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [] }] }) },
    ]);
    editor.commands.setTextSelection(2); // inside the empty heading
    expect(run(editor, mergeBlockBackward)).toBe(true);
    expect(decomposeDoc(editor.getJSON())[0].content).toContain("paragraph");
    editor.destroy();
  });

  it("deletes an empty block and lands the cursor above", () => {
    const editor = makeEditor([row("b1", "Above"), row("b2", "", { sort_rank: RANK_1 })]);
    // cursor into the empty b2 (position after b1's block).
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === "block" && pos === -1) pos = p; // first block
      return true;
    });
    // Put cursor in the empty second block explicitly.
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    expect(run(editor, mergeBlockBackward)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(1);
    expect(blocks[0].blockId).toBe("b1");
    editor.destroy();
  });

  it("Enter on a divider block inserts a new empty block after it", () => {
    const editor = makeEditor([
      { id: "b1", parent_block_id: null, sort_rank: RANK_0, type: "text",
        content: serializeNoteDocument({ type: "doc", content: [{ type: "horizontalRule" }] }) },
    ]);
    // Select the hr node (position 1 is inside the block, at the hr).
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));
    expect(run(editor, splitBlock)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(2);
    expect(JSON.parse(blocks[0].content).content[0].type).toBe("horizontalRule");
    expect(JSON.parse(blocks[1].content).content[0].type).toBe("paragraph");
    editor.destroy();
  });

  it("does not merge a paragraph into a code block above (no frankenblock)", () => {
    const editor = makeEditor([
      { id: "b1", parent_block_id: null, sort_rank: RANK_0, type: "text",
        content: serializeNoteDocument({ type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "code" }] }] }) },
      row("b2", "text", { sort_rank: RANK_1 }),
    ]);
    cursorInBlock(editor, "text", 0);
    expect(run(editor, mergeBlockBackward)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(2); // both blocks intact — nothing fused
    expect(JSON.parse(blocks[0].content).content[0].type).toBe("codeBlock");
    // b1 still holds exactly one content node (no frankenblock).
    expect(JSON.parse(blocks[0].content).content.length).toBe(1);
    editor.destroy();
  });

  it("deletes a nested empty block whose previous sibling is a paragraph", () => {
    const editor = makeEditor([
      row("p", "Parent"),
      row("a", "Above", { parent_block_id: "p", sort_rank: RANK_0 }),
      row("b", "", { parent_block_id: "p", sort_rank: RANK_1 }),
    ]);
    cursorInBlock(editor, "Above", 0); // ensure "a" exists nested; then move into empty "b"
    // Put the cursor in the empty nested block b.
    let bPos = -1;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === "block" && node.attrs.blockId === "b") bPos = p + 2; // into its paragraph
    });
    editor.commands.setTextSelection(bPos);
    expect(run(editor, mergeBlockBackward)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.map((x) => x.blockId).sort()).toEqual(["a", "p"]); // b removed
    expect(blocks.find((x) => x.blockId === "a")!.parentId).toBe("p"); // a stays nested
    editor.destroy();
  });

  it("converts an empty task block to a paragraph on Backspace", () => {
    const editor = makeEditor([taskRow("b1", "")]);
    cursorInFirstParagraph(editor);
    expect(run(editor, mergeBlockBackward)).toBe(true);
    const block = decomposeDoc(editor.getJSON())[0];
    expect(JSON.parse(block.content).content[0].type).toBe("paragraph");
    expect(block.type).toBe("text"); // blockType reset off "task"
    editor.destroy();
  });

  it("converts an empty task block to a paragraph on Enter (exit checklist)", () => {
    const editor = makeEditor([taskRow("b1", "")]);
    cursorInFirstParagraph(editor);
    expect(run(editor, splitBlock)).toBe(true);
    const block = decomposeDoc(editor.getJSON())[0];
    expect(JSON.parse(block.content).content[0].type).toBe("paragraph");
    expect(block.type).toBe("text");
    editor.destroy();
  });

  it("Enter on a non-empty task line makes a new task block below", () => {
    const editor = makeEditor([taskRow("b1", "Buy")]);
    cursorInBlock(editor, "Buy", 3); // end
    expect(run(editor, splitBlock)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(2);
    expect(blocks[0].type).toBe("task");
    expect(blocks[1].type).toBe("task"); // new block stays a task
    expect(JSON.parse(blocks[1].content).content[0].type).toBe("taskLine");
    editor.destroy();
  });

  it("splits a non-empty quote line into a new line within the quote (no crash)", () => {
    const editor = makeEditor([
      { id: "b1", parent_block_id: null, sort_rank: RANK_0, type: "text",
        content: serializeNoteDocument({ type: "doc", content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "QuoteLine" }] }] }] }) },
    ]);
    cursorInBlock(editor, "QuoteLine", 5); // mid-text
    expect(run(editor, splitBlock)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    // Still one block; the blockquote now has two paragraph lines.
    expect(blocks.length).toBe(1);
    const quote = JSON.parse(blocks[0].content).content[0];
    expect(quote.type).toBe("blockquote");
    expect(quote.content.length).toBe(2);
    editor.destroy();
  });

  it("merges a task block into the previous task block on Backspace at start", () => {
    const editor = makeEditor([taskRow("b1", "One"), taskRow("b2", "Two", { sort_rank: RANK_1 })]);
    cursorInBlock(editor, "Two", 0); // start of the second task block
    expect(run(editor, mergeBlockBackward)).toBe(true);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(1); // merged into the first
    expect(editor.getText()).toContain("OneTwo");
    editor.destroy();
  });

  it("exits an empty single quote block to a paragraph on Enter", () => {
    const editor = makeEditor([
      { id: "b1", parent_block_id: null, sort_rank: RANK_0, type: "text",
        content: serializeNoteDocument({ type: "doc", content: [{ type: "blockquote", content: [{ type: "paragraph" }] }] }) },
    ]);
    cursorInFirstParagraph(editor);
    expect(run(editor, splitBlock)).toBe(true);
    expect(JSON.parse(decomposeDoc(editor.getJSON())[0].content).content[0].type).toBe("paragraph");
    editor.destroy();
  });

  it("indent then undo restores the flat structure (native history)", () => {
    const editor = makeEditor([row("b1", "First"), row("b2", "Second", { sort_rank: RANK_1 })]);
    cursorInBlock(editor, "Second", 1);
    run(editor, indentBlock);
    expect(decomposeDoc(editor.getJSON()).find((b) => b.blockId === "b2")!.parentId).toBe("b1");
    editor.commands.undo();
    expect(decomposeDoc(editor.getJSON()).find((b) => b.blockId === "b2")!.parentId).toBe(null);
    editor.destroy();
  });
});
