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

import { useEffect, useRef, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";

import { NotesEditorBodySkeleton } from "@/components/notes/NotesPageSkeleton";
import { useNoteBlocks, type NoteBlockRow } from "@/hooks/use-notes";

import { useSingleBlockEditor, type SingleBlockEditorHandlers } from "./useSingleBlockEditor";
import { BlockMenuLayer } from "./BlockMenuLayer";
import { TableToolbarLayer } from "./TableToolbarLayer";
import { SlashMenuLayer } from "./SlashMenuLayer";
import type { SlashScope } from "@/components/notes/NoteBlockEditorSlash";
import { RefMenuLayer } from "./RefMenuLayer";

const SURFACE_CLASS = "notes-reading col-span-2 pt-2 sm:col-span-2 sm:col-start-2";

export function SingleBlockEditor({
  pageId,
  handlers,
  onEditorChange,
  autoFocus = false,
  enableSlash = true,
  slashScope = "all",
  debounceMs,
  ensurePage,
  deleteWhenEmpty,
  loadingFallback,
  animateEntrance = true,
}: {
  pageId: string;
  handlers?: SingleBlockEditorHandlers;
  onEditorChange?: (editor: Editor | null) => void;
  autoFocus?: boolean;
  /** Slash-command menu. On everywhere; the journal narrows it via `slashScope`. */
  enableSlash?: boolean;
  /** Which slash commands to offer; the journal uses "dates" (date actions only). */
  slashScope?: SlashScope;
  /** Save debounce; defaults to the persister's own default when omitted. */
  debounceMs?: number;
  /** Lazily create the page on first write (see BlockPersisterConfig.ensurePage). */
  ensurePage?: () => Promise<void>;
  /** Delete the page when the doc is emptied (see BlockPersisterConfig.deleteWhenEmpty). */
  deleteWhenEmpty?: boolean;
  /** Loading placeholder while blocks load; defaults to the full block-tree skeleton.
   * The journal passes a compact one so short entries don't cause layout shift. */
  loadingFallback?: ReactNode;
  /** Fade/slide the editor in on mount. Off for the journal, whose day-switching
   * remounts the editor constantly — the entrance would read as a jerky blink. */
  animateEntrance?: boolean;
}) {
  const { blocks, isLoading } = useNoteBlocks(pageId);

  if (isLoading) {
    return <div className={SURFACE_CLASS}>{loadingFallback ?? <NotesEditorBodySkeleton />}</div>;
  }
  return <SingleBlockEditorInner key={pageId} pageId={pageId} blocks={blocks} handlers={handlers} onEditorChange={onEditorChange} autoFocus={autoFocus} enableSlash={enableSlash} slashScope={slashScope} debounceMs={debounceMs} ensurePage={ensurePage} deleteWhenEmpty={deleteWhenEmpty} animateEntrance={animateEntrance} />;
}

function SingleBlockEditorInner({
  pageId,
  blocks,
  handlers,
  onEditorChange,
  autoFocus,
  enableSlash,
  slashScope,
  debounceMs,
  ensurePage,
  deleteWhenEmpty,
  animateEntrance,
}: {
  pageId: string;
  blocks: NoteBlockRow[];
  handlers?: SingleBlockEditorHandlers;
  onEditorChange?: (editor: Editor | null) => void;
  autoFocus?: boolean;
  enableSlash: boolean;
  slashScope: SlashScope;
  debounceMs?: number;
  ensurePage?: () => Promise<void>;
  deleteWhenEmpty?: boolean;
  animateEntrance: boolean;
}) {
  const editor = useSingleBlockEditor({ pageId, blocks, handlers, autoFocus, debounceMs, ensurePage, deleteWhenEmpty });
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onEditorChange?.(editor);
    return () => onEditorChange?.(null);
  }, [editor, onEditorChange]);

  // The entrance animation applies a transform; keep it on an inner wrapper so
  // it never becomes the containing block for the `fixed`-positioned block menu.
  return (
    <div ref={surfaceRef} className={`group/note-editor relative ${SURFACE_CLASS}`}>
      <div className={animateEntrance ? "animate-fade-slide-in" : undefined}>
        <EditorContent editor={editor} />
      </div>
      <BlockMenuLayer editor={editor} />
      <TableToolbarLayer editor={editor} containerRef={surfaceRef} />
      {enableSlash ? <SlashMenuLayer editor={editor} containerRef={surfaceRef} scope={slashScope} /> : null}
      <RefMenuLayer editor={editor} excludeId={pageId} />
    </div>
  );
}
