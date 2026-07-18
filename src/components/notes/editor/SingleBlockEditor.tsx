"use client";

/**
 * Minimal single-document editor mount for a notes page. Independent of the
 * legacy per-block store — reads block rows directly and renders one editor.
 * Used behind the `?editor=single` toggle to validate perf + feel before the
 * full cutover.
 *
 * A single `useNoteBlocks` subscription lives here and is passed down, so the
 * editor is seeded from the already-loaded rows in one shot (no empty-build +
 * reconcile flash). We wait for the first load before mounting the inner editor
 * so it never initializes from an empty document.
 */

import { EditorContent } from "@tiptap/react";

import { useNoteBlocks, type NoteBlockRow } from "@/hooks/use-notes";

import { useSingleBlockEditor } from "./useSingleBlockEditor";
import { BlockMenuLayer } from "./BlockMenuLayer";

const SURFACE_CLASS = "notes-reading col-span-2 pt-2 sm:col-span-2 sm:col-start-2";

export function SingleBlockEditor({ pageId }: { pageId: string }) {
  const { blocks, isLoading } = useNoteBlocks(pageId);

  if (isLoading) {
    return <div className={`${SURFACE_CLASS} text-sm text-muted-foreground`}>Loading…</div>;
  }
  return <SingleBlockEditorInner key={pageId} pageId={pageId} blocks={blocks} />;
}

function SingleBlockEditorInner({ pageId, blocks }: { pageId: string; blocks: NoteBlockRow[] }) {
  const editor = useSingleBlockEditor({ pageId, blocks });

  return (
    <div className={SURFACE_CLASS}>
      <EditorContent editor={editor} />
      <BlockMenuLayer editor={editor} />
    </div>
  );
}
