"use client";

/**
 * Single-document editor mount for a notes page (the default editor). Reads the
 * block rows directly and renders one editor, independent of the legacy
 * per-block store. `?editor=legacy` opts back into the old editor during cutover.
 *
 * A single `useNoteBlocks` subscription lives here and is passed down, so the
 * editor is seeded from the already-loaded rows in one shot (no empty-build +
 * reconcile flash). We wait for the first load before mounting the inner editor
 * so it never initializes from an empty document.
 *
 * The live editor instance is reported up via `onEditorChange` so the page
 * chrome (undo/redo buttons) can drive the one native history timeline.
 */

import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";

import { NotesEditorBodySkeleton } from "@/components/notes/NotesPageSkeleton";
import { useNoteBlocks, type NoteBlockRow } from "@/hooks/use-notes";

import { useSingleBlockEditor, type SingleBlockEditorHandlers } from "./useSingleBlockEditor";
import { BlockMenuLayer } from "./BlockMenuLayer";
import { TableToolbarLayer } from "./TableToolbarLayer";
import { SlashMenuLayer } from "./SlashMenuLayer";
import { RefMenuLayer } from "./RefMenuLayer";

const SURFACE_CLASS = "notes-reading col-span-2 pt-2 sm:col-span-2 sm:col-start-2";

export function SingleBlockEditor({
  pageId,
  handlers,
  onEditorChange,
  autoFocus = false,
  enableSlash = true,
  debounceMs,
  ensurePage,
}: {
  pageId: string;
  handlers?: SingleBlockEditorHandlers;
  onEditorChange?: (editor: Editor | null) => void;
  autoFocus?: boolean;
  /** Slash-command menu. Disabled in the journal, which wants plain prose. */
  enableSlash?: boolean;
  /** Save debounce; defaults to the persister's own default when omitted. */
  debounceMs?: number;
  /** Lazily create the page on first write (see BlockPersisterConfig.ensurePage). */
  ensurePage?: () => Promise<void>;
}) {
  const { blocks, isLoading } = useNoteBlocks(pageId);

  if (isLoading) {
    return (
      <div className={SURFACE_CLASS}>
        <NotesEditorBodySkeleton />
      </div>
    );
  }
  return <SingleBlockEditorInner key={pageId} pageId={pageId} blocks={blocks} handlers={handlers} onEditorChange={onEditorChange} autoFocus={autoFocus} enableSlash={enableSlash} debounceMs={debounceMs} ensurePage={ensurePage} />;
}

function SingleBlockEditorInner({
  pageId,
  blocks,
  handlers,
  onEditorChange,
  autoFocus,
  enableSlash,
  debounceMs,
  ensurePage,
}: {
  pageId: string;
  blocks: NoteBlockRow[];
  handlers?: SingleBlockEditorHandlers;
  onEditorChange?: (editor: Editor | null) => void;
  autoFocus?: boolean;
  enableSlash: boolean;
  debounceMs?: number;
  ensurePage?: () => Promise<void>;
}) {
  const editor = useSingleBlockEditor({ pageId, blocks, handlers, autoFocus, debounceMs, ensurePage });
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onEditorChange?.(editor);
    return () => onEditorChange?.(null);
  }, [editor, onEditorChange]);

  // The entrance animation applies a transform; keep it on an inner wrapper so
  // it never becomes the containing block for the `fixed`-positioned block menu.
  return (
    <div ref={surfaceRef} className={`group/note-editor relative ${SURFACE_CLASS}`}>
      <div className="animate-fade-slide-in">
        <EditorContent editor={editor} />
      </div>
      <BlockMenuLayer editor={editor} />
      <TableToolbarLayer editor={editor} containerRef={surfaceRef} />
      {enableSlash ? <SlashMenuLayer editor={editor} containerRef={surfaceRef} /> : null}
      <RefMenuLayer editor={editor} excludeId={pageId} />
    </div>
  );
}
