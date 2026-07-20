/// <reference types="vitest/globals" />

/** Remote-reconcile path of the persister (needs a live editor). */

import { LexoRank } from "lexorank";
import { Editor } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import History from "@tiptap/extension-history";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { assembleDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { BlockDocumentPersister } from "@/lib/notes/editor/block-persister";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

// Avoid instantiating the real PowerSync WASQLite db (unavailable in jsdom).
// reconcileRemote never touches the db, but the import chain does.
vi.mock("@/lib/powersync/db", () => ({
  db: { execute: vi.fn(), writeTransaction: vi.fn() },
}));
vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId: vi.fn(async () => "user-1") }));
vi.mock("@/lib/notes/notes", () => ({ reconcileNoteBlockEdges: vi.fn(async () => {}) }));

const RANK_0 = LexoRank.middle().format();

function docContent(text: string): string {
  return serializeNoteDocument({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}
function row(id: string, text: string): BlockDocumentRow {
  return { id, parent_block_id: null, sort_rank: RANK_0, type: "text", content: docContent(text) };
}

function setup(rows: BlockDocumentRow[], ensurePage?: () => Promise<void>) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [NotesDocument, BlockNode, asBlockContent(Paragraph), Text, History, BlockIdPlugin],
    content: assembleDoc(rows) as never,
  });
  const persister = new BlockDocumentPersister("page-1", { getDoc: () => editor.getJSON(), debounceMs: 5, ensurePage });
  persister.hydrate(rows);
  return { editor, persister };
}

describe("BlockDocumentPersister.reconcileRemote", () => {
  it("applies a remote change to the open document when there is no local work", () => {
    const { editor, persister } = setup([row("b1", "hello")]);
    persister.reconcileRemote(editor, [row("b1", "world")]);
    expect(editor.getText()).toContain("world");
    editor.destroy();
  });

  it("does not add the remote change to the undo history", () => {
    const { editor, persister } = setup([row("b1", "hello")]);
    persister.reconcileRemote(editor, [row("b1", "world")]);
    // Nothing local was pushed, so undo is a no-op — the remote content stays.
    editor.commands.undo();
    expect(editor.getText()).toContain("world");
    editor.destroy();
  });

  it("defers a remote change while there are unsaved local edits (local wins)", () => {
    const { editor, persister } = setup([row("b1", "hello")]);
    // Dirty the document locally.
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, "!");
    expect(persister.hasPendingWrites()).toBe(true);

    persister.reconcileRemote(editor, [row("b1", "world")]);
    // Local edit is preserved; remote is not applied yet.
    expect(editor.getText()).not.toContain("world");
    editor.destroy();
  });
});

describe("BlockDocumentPersister lazy page creation", () => {
  it("does not create the page while the doc is an empty starter", async () => {
    const ensurePage = vi.fn(async () => {});
    // Start from no rows → the editor mounts an empty stamped starter block.
    const { editor, persister } = setup([], ensurePage);
    await persister.flush();
    expect(ensurePage).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("creates the page on the first real content write", async () => {
    const ensurePage = vi.fn(async () => {});
    const { editor, persister } = setup([], ensurePage);
    editor.commands.insertContent("hello");
    await persister.flush();
    expect(ensurePage).toHaveBeenCalledTimes(1);
    editor.destroy();
  });
});
