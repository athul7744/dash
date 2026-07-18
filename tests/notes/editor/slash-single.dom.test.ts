/// <reference types="vitest/globals" />

/**
 * Slash detection + application on the single document: a `/token` at a block
 * start is detected; applying converts the block's content node (heading),
 * toggles a color, or converts to a query block — leaving siblings/children
 * untouched.
 */

import { LexoRank } from "lexorank";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { buildNoteEditorExtensions } from "@/lib/notes/editor/extensions";
import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { getSlashContext, applySlashCommand } from "@/lib/notes/editor/slash-single";
import { slashCommands, querySlashCommand, colorSlashCommands } from "@/components/notes/NoteBlockEditorSlash";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }));

const RANK_0 = LexoRank.middle().format();
const RANK_1 = LexoRank.middle().genNext().format();

function content(nodes: unknown[]): string {
  return serializeNoteDocument({ type: "doc", content: nodes });
}

function makeEditor(rows: BlockDocumentRow[]) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({ element, extensions: buildNoteEditorExtensions(), content: assembleDoc(rows) as never });
}

/** Place the cursor at the end of the first block's paragraph. */
function cursorInFirstBlock(editor: Editor) {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos < 0 && node.type.name === "paragraph") pos = p + node.nodeSize - 1;
    return pos < 0;
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}

const twoBlocks: BlockDocumentRow[] = [
  { id: "b1", parent_block_id: null, sort_rank: RANK_0, type: "text", content: content([{ type: "paragraph" }]) },
  { id: "b2", parent_block_id: null, sort_rank: RANK_1, type: "text", content: content([{ type: "paragraph", content: [{ type: "text", text: "keep me" }] }]) },
];

describe("slash-single", () => {
  it("detects a /token at a block start and ignores mid-paragraph slashes", () => {
    const editor = makeEditor(twoBlocks);
    cursorInFirstBlock(editor);
    editor.commands.insertContent("/h1");
    const ctx = getSlashContext(editor);
    expect(ctx?.query).toBe("h1");

    // A slash after text is not a command trigger.
    cursorInFirstBlock(editor);
    editor.commands.setContent(assembleDoc(twoBlocks) as never);
    editor.commands.insertContentAt(editor.state.doc.content.size - 4, "hi /x");
    expect(getSlashContext(editor)).toBeNull();
    editor.destroy();
  });

  it("converts the current block to a heading without touching siblings", () => {
    const editor = makeEditor(twoBlocks);
    cursorInFirstBlock(editor);
    editor.commands.insertContent("/h1");
    const ctx = getSlashContext(editor)!;
    const h1 = slashCommands.find((c) => c.id === "heading-1")!;
    applySlashCommand(editor, h1, ctx);

    const decomposed = decomposeDoc(editor.getJSON());
    expect(JSON.parse(decomposed[0].content).content[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    // Sibling untouched.
    expect(JSON.parse(decomposed[1].content).content[0].content[0].text).toBe("keep me");
    editor.destroy();
  });

  it("applies a color to the current block's content node", () => {
    const editor = makeEditor(twoBlocks);
    cursorInFirstBlock(editor);
    editor.commands.insertContent("/green");
    const ctx = getSlashContext(editor)!;
    const green = colorSlashCommands.find((c) => c.id === "color-green")!;
    applySlashCommand(editor, green, ctx);

    const decomposed = decomposeDoc(editor.getJSON());
    expect(JSON.parse(decomposed[0].content).content[0].attrs.color).toBe("green");
    editor.destroy();
  });

  it("converts a block into a query block (type + node)", () => {
    const editor = makeEditor(twoBlocks);
    cursorInFirstBlock(editor);
    editor.commands.insertContent("/query");
    const ctx = getSlashContext(editor)!;
    applySlashCommand(editor, querySlashCommand, ctx);

    const decomposed = decomposeDoc(editor.getJSON());
    expect(decomposed[0].type).toBe("query");
    expect(JSON.parse(decomposed[0].content).content[0].type).toBe("queryBlock");
    editor.destroy();
  });
});
