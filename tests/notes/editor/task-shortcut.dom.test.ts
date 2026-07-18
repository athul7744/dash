/// <reference types="vitest/globals" />

/**
 * The `[] ` / `[x] ` markdown checkbox shortcut turns a paragraph block into a
 * task block (taskLine content, blockType "task"), verified through a live
 * editor by driving ProseMirror's input-rule handling.
 */

import { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { TaskLine } from "@/components/notes/editor/TaskLineNode";
import { TaskShortcut } from "@/components/notes/NoteBlockEditorExtensions";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { BlockNormalize } from "@/lib/notes/editor/block-normalize";
import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

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
    extensions: [NotesDocument, BlockNode, asBlockContent(Paragraph), TaskLine, Text, History, TaskShortcut, BlockIdPlugin, BlockNormalize],
    content: assembleDoc(rows) as never,
  });
}

/** Simulate typing `text` at the end of the document, firing input rules. */
function typeAtEnd(editor: Editor, text: string) {
  editor.commands.setTextSelection(editor.state.doc.content.size);
  const { view } = editor;
  const pos = view.state.selection.from;
  view.someProp("handleTextInput", (handler) => {
    const fn = handler as (v: EditorView, from: number, to: number, text: string) => boolean;
    return fn(view, pos, pos, text);
  });
}

describe("task checkbox shortcut", () => {
  it("converts `[] ` at block start into an unchecked task", () => {
    const editor = makeEditor([row("b1", "[]")]);
    typeAtEnd(editor, " ");

    const [block] = decomposeDoc(editor.getJSON());
    expect(block.type).toBe("task");
    const content = JSON.parse(block.content).content;
    expect(content[0].type).toBe("taskLine");
    expect(content[0].attrs.checked).toBe(false);
    editor.destroy();
  });

  it("converts `[x] ` into a checked task", () => {
    const editor = makeEditor([row("b1", "[x]")]);
    typeAtEnd(editor, " ");

    const content = JSON.parse(decomposeDoc(editor.getJSON())[0].content).content;
    expect(content[0].type).toBe("taskLine");
    expect(content[0].attrs.checked).toBe(true);
    editor.destroy();
  });

  it("leaves a checkbox typed mid-paragraph as plain text", () => {
    const editor = makeEditor([row("b1", "note []")]);
    typeAtEnd(editor, " ");

    const [block] = decomposeDoc(editor.getJSON());
    expect(block.type).toBe("text");
    expect(JSON.parse(block.content).content[0].type).toBe("paragraph");
    editor.destroy();
  });
});
