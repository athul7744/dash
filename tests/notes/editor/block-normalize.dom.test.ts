/// <reference types="vitest/globals" />

/**
 * The normalizer keeps the one-content-node-per-block invariant: a block that
 * ends up with a second content node (e.g. from a native list/quote exit) is
 * split into separate sibling blocks automatically.
 */

import { Editor } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import History from "@tiptap/extension-history";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { BlockNormalize } from "@/lib/notes/editor/block-normalize";
import { decomposeDoc } from "@/lib/notes/editor/block-document";

function makeEditor(content: unknown): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [NotesDocument, BlockNode, asBlockContent(Paragraph), Text, History, BlockIdPlugin, BlockNormalize],
    content: content as never,
  });
}

function frankenblockCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "block") {
      let content = 0;
      node.forEach((c) => { if (c.type.name !== "block") content += 1; });
      if (content > 1) count += 1;
    }
    return true;
  });
  return count;
}

describe("block normalizer", () => {
  it("splits a block with two content nodes into two blocks on the next edit", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{
        type: "block", attrs: { blockId: "b1", blockType: "text" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First" }] },
          { type: "paragraph", content: [{ type: "text", text: "Second" }] },
        ],
      }],
    });
    // A frankenblock loaded as-is; a doc-changing edit triggers the repair.
    editor.commands.insertContentAt(1, "");
    editor.commands.command(({ tr, dispatch }) => { if (dispatch) dispatch(tr.insertText("x", 2)); return true; });

    expect(frankenblockCount(editor)).toBe(0);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.length).toBe(2);
    // First block keeps the original id; the split-off one gets a fresh id.
    expect(blocks[0].blockId).toBe("b1");
    expect(blocks[1].blockId).not.toBe("b1");
    expect(blocks[1].blockId.length).toBeGreaterThan(0);
    expect(editor.getText()).toContain("Second");
    editor.destroy();
  });

  it("keeps child blocks with the first block when splitting", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{
        type: "block", attrs: { blockId: "p", blockType: "text" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Line" }] },
          { type: "paragraph", content: [{ type: "text", text: "Stray" }] },
          { type: "block", attrs: { blockId: "c", blockType: "text" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Child" }] }] },
        ],
      }],
    });
    editor.commands.command(({ tr, dispatch }) => { if (dispatch) dispatch(tr.insertText("!", 2)); return true; });

    expect(frankenblockCount(editor)).toBe(0);
    const blocks = decomposeDoc(editor.getJSON());
    expect(blocks.find((b) => b.blockId === "c")!.parentId).toBe("p"); // child stays under the first block
    expect(blocks.some((b) => JSON.parse(b.content).content[0]?.content?.[0]?.text === "Stray")).toBe(true);
    editor.destroy();
  });
});
