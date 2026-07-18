"use client";

/**
 * Read-only renderer for a page's blocks (backlink previews, PagePeekPopover).
 *
 * Renders through the SAME single-document schema the editor uses: the flat
 * block rows are assembled into one doc and shown in a non-editable Tiptap
 * instance. This keeps previews byte-consistent with the editor (query/math/
 * code/task blocks all render identically) and removes the dependency on the
 * legacy per-block NoteBlockEditor.
 */

import { useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";

import { assembleDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { buildNoteEditorExtensions } from "@/lib/notes/editor/extensions";

/** Flat block row shape needed to assemble the read-only document. */
export type ReadOnlyBlockData = {
  id: string;
  parent_block_id?: string | null;
  sort_rank?: string | null;
  type?: string | null;
  content?: string | null;
};

function toRow(block: ReadOnlyBlockData): BlockDocumentRow {
  return {
    id: block.id,
    parent_block_id: block.parent_block_id ?? null,
    sort_rank: block.sort_rank ?? "",
    type: block.type ?? "text",
    content: block.content ?? "{}",
  };
}

export function ReadOnlyBlockRenderer({ blocks }: { blocks: ReadOnlyBlockData[] }) {
  const content = useMemo(() => assembleDoc(blocks.map(toRow)), [blocks]);
  const editor = useEditor(
    {
      editable: false,
      immediatelyRender: false,
      extensions: buildNoteEditorExtensions(),
      content,
      editorProps: { attributes: { class: "outline-none" } },
    },
    [content],
  );

  return (
    <div className="notes-reading note-readonly pointer-events-none">
      <EditorContent editor={editor} />
    </div>
  );
}
