/// <reference types="vitest/globals" />

/**
 * Cross-block paste behavior. In a single ProseMirror document, paste is native
 * (replaceSelection with the parsed slice); we verify the pieces the block model
 * adds hold up: pasted content becomes well-formed blocks (normalizer), and
 * duplicated block ids from an internal copy are re-stamped unique (id plugin).
 */

import { Editor } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import History from "@tiptap/extension-history";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { BlockNormalize } from "@/lib/notes/editor/block-normalize";
import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

function makeEditor(rows: BlockDocumentRow[]): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [NotesDocument, BlockNode, asBlockContent(Paragraph), Text, History, BlockIdPlugin, BlockNormalize],
    content: assembleDoc(rows) as never,
  });
}

function row(id: string, text: string, over: Partial<BlockDocumentRow> = {}): BlockDocumentRow {
  return {
    id, parent_block_id: null, sort_rank: "a", type: "text",
    content: serializeNoteDocument({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] }),
    ...over,
  };
}

/** Parse an HTML string into a ProseMirror slice, as a real paste would. */
function sliceFromHTML(editor: Editor, html: string) {
  const dom = document.createElement("div");
  dom.innerHTML = html;
  return PMDOMParser.fromSchema(editor.schema).parseSlice(dom);
}

function frankenblockCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "block") {
      let c = 0;
      node.forEach((ch) => { if (ch.type.name !== "block") c += 1; });
      if (c > 1) count += 1;
    }
    return true;
  });
  return count;
}

describe("cross-block paste", () => {
  it("pastes external multi-paragraph HTML as well-formed blocks", () => {
    const editor = makeEditor([row("b1", "Hello")]);
    // Cursor at the end of "Hello".
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    const slice = sliceFromHTML(editor, "<p>One</p><p>Two</p>");
    editor.view.dispatch(editor.state.tr.replaceSelection(slice).scrollIntoView());

    expect(frankenblockCount(editor)).toBe(0);
    const text = editor.getText();
    expect(text).toContain("One");
    expect(text).toContain("Two");
    // Every block still has exactly one content node.
    for (const b of decomposeDoc(editor.getJSON())) {
      expect(JSON.parse(b.content).content.length).toBe(1);
    }
    editor.destroy();
  });

  it("re-stamps duplicate block ids when a copied block is pasted", () => {
    const editor = makeEditor([row("b1", "Original")]);
    // Simulate pasting a copy of the block (same data-block-id) at the end.
    editor.commands.setTextSelection(editor.state.doc.content.size);
    const slice = sliceFromHTML(
      editor,
      '<div data-block-id="b1" data-block-type="text"><p>Copy</p></div>',
    );
    editor.view.dispatch(editor.state.tr.replaceSelection(slice).scrollIntoView());

    const ids = decomposeDoc(editor.getJSON()).map((b) => b.blockId);
    // No duplicate ids survive.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === "b1").length).toBe(1);
    editor.destroy();
  });
});
