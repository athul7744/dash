/// <reference types="vitest/globals" />

/** Native block structural commands, verified through a live editor. */

import { LexoRank } from "lexorank";
import { Editor } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import History from "@tiptap/extension-history";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { splitBlock, indentBlock, outdentBlock, mergeBlockBackward, type BlockCommand } from "@/lib/notes/editor/block-commands";
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
    extensions: [NotesDocument, BlockNode, asBlockContent(Paragraph), Text, History, BlockIdPlugin],
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
