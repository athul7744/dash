/// <reference types="vitest/globals" />

/**
 * Markdown-typing shortcuts for blocks that had no input rule: divider (`---`),
 * image (`![alt](url)`), and block color (`!blue `/`!none `). Driven through a
 * live editor via ProseMirror's input-rule handling.
 */

import { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { BlockColor } from "@/components/notes/NoteBlockEditorColor";
import { BlockColorShortcut, MarkdownLink, NotesHorizontalRule, NotesImage } from "@/components/notes/NoteBlockEditorExtensions";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { BlockNormalize } from "@/lib/notes/editor/block-normalize";
import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

function row(id: string, text: string, attrs?: Record<string, unknown>): BlockDocumentRow {
  return {
    id,
    parent_block_id: null,
    sort_rank: "a",
    type: "text",
    content: serializeNoteDocument({
      type: "doc",
      content: [{ type: "paragraph", ...(attrs ? { attrs } : {}), content: text ? [{ type: "text", text }] : [] }],
    }),
  };
}

function makeEditor(rows: BlockDocumentRow[]): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      NotesDocument,
      BlockNode,
      asBlockContent(Paragraph),
      asBlockContent(NotesHorizontalRule),
      asBlockContent(NotesImage),
      Text,
      History,
      BlockColor,
      BlockColorShortcut,
      MarkdownLink,
      BlockIdPlugin,
      BlockNormalize,
    ],
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

const firstContent = (editor: Editor, i = 0) => JSON.parse(decomposeDoc(editor.getJSON())[i].content).content[0];

describe("divider shortcut", () => {
  it("turns `---` into a horizontalRule block plus a fresh paragraph after", () => {
    const editor = makeEditor([row("b1", "--")]);
    typeAtEnd(editor, "-");

    const blocks = decomposeDoc(editor.getJSON());
    expect(JSON.parse(blocks[0].content).content[0].type).toBe("horizontalRule");
    expect(blocks).toHaveLength(2);
    expect(JSON.parse(blocks[1].content).content[0].type).toBe("paragraph");
    editor.destroy();
  });
});

describe("image shortcut", () => {
  it("turns `![alt](url)` into an image block", () => {
    const editor = makeEditor([row("b1", "![cat](https://example.com/c.png")]);
    typeAtEnd(editor, ")");

    const img = firstContent(editor);
    expect(img.type).toBe("image");
    expect(img.attrs.src).toBe("https://example.com/c.png");
    expect(img.attrs.alt).toBe("cat");
    editor.destroy();
  });
});

describe("block color shortcut", () => {
  it("`!blue ` sets the block color", () => {
    const editor = makeEditor([row("b1", "!blue")]);
    typeAtEnd(editor, " ");
    expect(firstContent(editor).attrs.color).toBe("blue");
    editor.destroy();
  });

  it("`!none ` clears an existing block color", () => {
    const editor = makeEditor([row("b1", "!none", { color: "green" })]);
    typeAtEnd(editor, " ");
    expect(firstContent(editor).attrs?.color ?? null).toBeNull();
    editor.destroy();
  });

  it("leaves an unknown `!keyword ` as plain text", () => {
    const editor = makeEditor([row("b1", "!important")]);
    typeAtEnd(editor, " ");
    const node = firstContent(editor);
    expect(node.type).toBe("paragraph");
    expect(node.attrs?.color ?? null).toBeNull();
    editor.destroy();
  });
});

describe("markdown link shortcut", () => {
  it("turns `[label](url)` into the label linked to the url, not the url as text", () => {
    const editor = makeEditor([row("b1", "[Roadmap](https://x.com")]);
    typeAtEnd(editor, ")");

    const para = firstContent(editor);
    const textNode = para.content.find((n: { type: string; text?: string }) => n.type === "text");
    expect(textNode.text).toBe("Roadmap");
    const linkMark = textNode.marks.find((m: { type: string }) => m.type === "link");
    expect(linkMark.attrs.href).toBe("https://x.com");
    // The URL must not survive as its own visible text.
    expect(JSON.stringify(para.content)).not.toContain(">https://x.com<");
    editor.destroy();
  });
});
