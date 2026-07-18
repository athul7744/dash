/// <reference types="vitest/globals" />

/**
 * Spike-level validation of the single-document schema: build ONE editor with
 * the `block` wrapper + regrouped content nodes and confirm the schema
 * constructs, the doc⇄rows bridge round-trips through a live editor, the
 * stable-id plugin stamps new blocks, and native structural + undo commands
 * work at the schema level.
 */

import { Editor } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import History from "@tiptap/extension-history";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import {
  assembleDoc,
  decomposeDoc,
  type BlockDocumentRow,
} from "@/lib/notes/editor/block-document";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

function makeEditor(content: unknown): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      NotesDocument,
      BlockNode,
      asBlockContent(Paragraph),
      asBlockContent(Heading.configure({ levels: [1, 2, 3, 4, 5] })),
      Text,
      History,
      BlockIdPlugin,
    ],
    content: content as never,
  });
}

function docContent(nodes: unknown[]): string {
  return serializeNoteDocument({ type: "doc", content: nodes });
}

const rows: BlockDocumentRow[] = [
  { id: "b1", parent_block_id: null, sort_rank: "a0", type: "text", content: docContent([{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] }]) },
  { id: "b2", parent_block_id: null, sort_rank: "a1", type: "text", content: docContent([{ type: "paragraph", content: [{ type: "text", text: "Parent" }] }]) },
  { id: "b3", parent_block_id: "b2", sort_rank: "a0", type: "text", content: docContent([{ type: "paragraph", content: [{ type: "text", text: "Child" }] }]) },
];

describe("single-document schema (spike)", () => {
  it("constructs the schema and renders an assembled document", () => {
    const editor = makeEditor(assembleDoc(rows));
    // Schema built with the block wrapper + blockContent group; nesting preserved.
    const decomposed = decomposeDoc(editor.getJSON());
    expect(decomposed.map((b) => b.blockId)).toEqual(["b1", "b2", "b3"]);
    expect(decomposed.map((b) => b.parentId)).toEqual([null, null, "b2"]);
    editor.destroy();
  });

  it("round-trips content through a live editor unchanged", () => {
    const editor = makeEditor(assembleDoc(rows));
    const decomposed = decomposeDoc(editor.getJSON());
    for (const original of rows) {
      const restored = decomposed.find((b) => b.blockId === original.id)!;
      expect(restored.content).toBe(original.content);
    }
    editor.destroy();
  });

  it("stamps a stable id on a block inserted without one", () => {
    const editor = makeEditor(assembleDoc(rows));
    // Insert a new block with no blockId at the end of the doc.
    editor
      .chain()
      .insertContentAt(editor.state.doc.content.size, {
        type: "block",
        attrs: { blockType: "text" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "New" }] }],
      })
      .run();

    const decomposed = decomposeDoc(editor.getJSON());
    const ids = decomposed.map((b) => b.blockId);
    expect(ids.length).toBe(4);
    // Every block ends up with a non-empty, unique id.
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    editor.destroy();
  });

  it("supports native undo/redo of a content edit", () => {
    const editor = makeEditor(assembleDoc(rows));
    editor.commands.insertContentAt(3, "X");
    const edited = editor.getText();
    editor.commands.undo();
    const undone = editor.getText();
    expect(undone).not.toBe(edited);
    editor.commands.redo();
    expect(editor.getText()).toBe(edited);
    editor.destroy();
  });
});
