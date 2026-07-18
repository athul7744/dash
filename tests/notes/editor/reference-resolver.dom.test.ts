/// <reference types="vitest/globals" />

/**
 * getResolvedPageReferenceAtPosition backs the single editor's [[page]] click /
 * hover handling: given a cursor position it returns the [[title]] under it, or
 * null when the cursor isn't inside a reference.
 */

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import { getResolvedPageReferenceAtPosition } from "@/lib/notes/editor-document-helpers";

function makeEditor(text: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [Document, Paragraph, Text],
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  });
}

/** Position of the first occurrence of `needle` within the paragraph text. */
function posOf(text: string, needle: string): number {
  return 1 + text.indexOf(needle); // +1 for the paragraph open token
}

describe("getResolvedPageReferenceAtPosition", () => {
  it("resolves the [[title]] the cursor sits inside", () => {
    const text = "See [[Roadmap]] today";
    const editor = makeEditor(text);
    const ref = getResolvedPageReferenceAtPosition(editor, posOf(text, "Roadmap"));
    expect(ref?.title).toBe("Roadmap");
    editor.destroy();
  });

  it("returns null when the cursor is outside any reference", () => {
    const text = "See [[Roadmap]] today";
    const editor = makeEditor(text);
    expect(getResolvedPageReferenceAtPosition(editor, posOf(text, "today"))).toBeNull();
    editor.destroy();
  });

  it("trims surrounding whitespace in the title", () => {
    const text = "x [[ Spaced Title ]] y";
    const editor = makeEditor(text);
    const ref = getResolvedPageReferenceAtPosition(editor, posOf(text, "Spaced"));
    expect(ref?.title).toBe("Spaced Title");
    editor.destroy();
  });
});
