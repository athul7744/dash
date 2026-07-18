/// <reference types="vitest/globals" />

/**
 * Validates the full single-document extension set forms a valid schema (block
 * wrapper + all re-grouped content nodes coexist) and round-trips content. Uses
 * a plain doc so the heavy math/code NodeViews aren't invoked in jsdom — their
 * rendering is validated in-browser.
 */

import { LexoRank } from "lexorank";
import { Editor } from "@tiptap/core";

import { buildNoteEditorExtensions } from "@/lib/notes/editor/extensions";
import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

// KaTeX / lowlight NodeViews need browser APIs; the plain doc below avoids them.
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }));

const RANK_0 = LexoRank.middle().format();
const RANK_1 = LexoRank.middle().genNext().format();

function content(nodes: unknown[]): string {
  return serializeNoteDocument({ type: "doc", content: nodes });
}

const rows: BlockDocumentRow[] = [
  { id: "b1", parent_block_id: null, sort_rank: RANK_0, type: "text", content: content([{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] }]) },
  { id: "b2", parent_block_id: null, sort_rank: RANK_1, type: "text", content: content([{ type: "paragraph", attrs: { color: "yellow" }, content: [{ type: "text", text: "Colored", marks: [{ type: "bold" }] }] }]) },
  { id: "b3", parent_block_id: "b2", sort_rank: RANK_0, type: "text", content: content([{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }] }]) },
];

describe("buildNoteEditorExtensions", () => {
  it("constructs a valid schema with all content nodes grouped under block", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: buildNoteEditorExtensions(),
      content: assembleDoc(rows) as never,
    });

    // Schema built; block-level nodes are in the blockContent group.
    expect(editor.schema.nodes.block).toBeTruthy();
    expect(editor.schema.nodes.paragraph.spec.group).toContain("blockContent");
    expect(editor.schema.nodes.heading.spec.group).toContain("blockContent");
    expect(editor.schema.nodes.mathBlock.spec.group).toContain("blockContent");
    // Inline / child nodes keep their groups.
    expect(editor.schema.nodes.mathInline.spec.group).toContain("inline");
    editor.destroy();
  });

  it("round-trips heading, colored+bold text, and a nested blockquote", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: buildNoteEditorExtensions(),
      content: assembleDoc(rows) as never,
    });

    const decomposed = decomposeDoc(editor.getJSON());
    expect(decomposed.map((b) => b.blockId)).toEqual(["b1", "b2", "b3"]);
    expect(decomposed.find((b) => b.blockId === "b3")!.parentId).toBe("b2");
    for (const original of rows) {
      expect(decomposed.find((b) => b.blockId === original.id)!.content).toBe(original.content);
    }
    editor.destroy();
  });
});
