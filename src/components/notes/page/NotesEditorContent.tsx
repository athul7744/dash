"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useQuery } from "@powersync/react";

import { NotesBlockTree } from "@/components/notes/NotesBlockTree";
import { SingleBlockEditor } from "@/components/notes/editor/SingleBlockEditor";
import { NotesEditorMainSkeleton } from "@/components/notes/NotesPageSkeleton";
import type { JsonValue, NoteBlockInsert } from "@/lib/notes/notes";
import { Tag } from "@/lib/powersync/AppSchema";

import { NotesEditorHeader } from "./NotesEditorHeader";
import { NotePageProperties } from "./NotePageProperties";
import type { NotesEditorRenderableContent } from "./types";
import type { BlockRangeMoveDirection } from "@/lib/notes/block-editor-structure";

type FocusTarget = { blockId: string; placement: number | "start" | "end" } | null;

export function NotesEditorContent({
  editorContent,
  showSelectedPageLoading,
  showEditorOverlay,
  shouldAnimateEditorContent,
  pageTitleDraft,
  pageTitleError,
  isEmojiPickerOpen,
  activePageEmoji,
  selectedTagIdsDraft,
  focusTarget,
  notePageTitles,
  selectedPageProperties,
  onBack,
  onTitleChange,
  onCommitTitle,
  onToggleFavorite,
  onEmojiPickerOpenChange,
  onSelectEmoji,
  onSelectedTagIdsChange,
  onCopyDocument,
  onOpenDeleteDialog,
  onCreateFirstBlock,
  onFocusApplied,
  onFocusBlock,
  onOpenPageReference,
  onPeekPageReference,
  onCreateSibling,
  onCreateEmptySibling,
  onCreateSiblings,
  onMergeWithPrevious,
  onCommitContent,
  onIndent,
  onOutdent,
  onMoveSelectedBlockRange,
  onDelete,
  onDeleteRange,
  onUpdateContent,
  onEditorRef,
  onConvertBlockType,
  onSingleEditorChange,
}: {
  editorContent: NotesEditorRenderableContent;
  showSelectedPageLoading: boolean;
  showEditorOverlay: boolean;
  shouldAnimateEditorContent: boolean;
  pageTitleDraft: string;
  pageTitleError: string | null;
  isEmojiPickerOpen: boolean;
  activePageEmoji: string | null;
  selectedTagIdsDraft: string[];
  focusTarget: FocusTarget;
  notePageTitles: string[];
  selectedPageProperties: Record<string, unknown>;
  onBack: () => void;
  onTitleChange: (value: string) => void;
  onCommitTitle: () => void | Promise<void>;
  onToggleFavorite: () => void;
  onEmojiPickerOpenChange: (open: boolean) => void;
  onSelectEmoji: (emoji: string | null) => void;
  onSelectedTagIdsChange: (tagIds: string[]) => void;
  onCopyDocument: () => void | Promise<void>;
  onOpenDeleteDialog: () => void;
  onCreateFirstBlock: () => void | Promise<void>;
  onFocusApplied: () => void;
  onFocusBlock: (blockId: string, placement: "start" | "end") => void;
  onOpenPageReference: (title: string) => void;
  onPeekPageReference?: (title: string, rect: DOMRect) => void;
  onCreateSibling: (
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: JsonValue,
    nextSiblingContent?: JsonValue,
    options?: {
      focusPlacement?: "start" | "end";
      focusTarget?: "created" | "current";
      insertionSide?: "before" | "after";
    }
  ) => void | Promise<void>;
  onCreateEmptySibling: (blockId: string, parentBlockId: string | null | undefined) => void | Promise<void>;
  onCreateSiblings: (blockId: string, parentBlockId: string | null | undefined, nextContent: NoteBlockInsert, nextSiblingContents: NoteBlockInsert[]) => void | Promise<void>;
  onMergeWithPrevious: (blockId: string, previousBlockId: string, nextContent: JsonValue, options?: { hasChildren?: boolean }) => void | Promise<void>;
  onCommitContent: (blockId: string, nextContent: JsonValue) => void;
  onIndent: (blockId: string, nextParentBlockId: string) => void;
  onOutdent: (blockId: string, nextParentBlockId?: string | null) => void;
  onMoveSelectedBlockRange: (blockIds: string[], direction: BlockRangeMoveDirection, focusBlockId: string) => void;
  onDelete: (blockId: string) => void | Promise<void>;
  onDeleteRange: (blockIds: string[]) => void | Promise<void>;
  onUpdateContent: (blockId: string, nextContent: JsonValue) => void;
  onEditorRef?: (blockId: string, editor: Editor | null) => void;
  onConvertBlockType?: (blockId: string, blockType: string, content: unknown) => void;
  onSingleEditorChange?: (editor: Editor | null) => void;
}) {
  const { data: allTags = [], isLoading: isLoadingTags } = useQuery<Tag>("SELECT * FROM tags ORDER BY name ASC");
  const [blocksSettled, setBlocksSettled] = useState(false);
  const blockCount = editorContent?.blocks.length ?? 0;
  const emptySettleTimerRef = useRef<number | null>(null);
  const previousPageIdRef = useRef<string | null | undefined>(editorContent?.pageId);

  // The single-document editor is the default; `?editor=legacy` opts back into
  // the legacy per-block editor as a temporary escape hatch during cutover. This
  // client-only subtree (under PowerSyncProvider) isn't meaningfully SSR'd, so a
  // render-time read of the URL is fine.
  const useSingleEditor =
    typeof window === "undefined" || new URLSearchParams(window.location.search).get("editor") !== "legacy";

  // Reset settling state when navigating to a different page
  if (editorContent?.pageId !== previousPageIdRef.current) {
    previousPageIdRef.current = editorContent?.pageId;
    if (blocksSettled) {
      setBlocksSettled(false);
    }
    if (emptySettleTimerRef.current !== null) {
      window.clearTimeout(emptySettleTimerRef.current);
      emptySettleTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (blocksSettled) return;

    if (blockCount > 0) {
      // Blocks arrived — onFirstBlockReady will handle settling
      if (emptySettleTimerRef.current !== null) {
        window.clearTimeout(emptySettleTimerRef.current);
        emptySettleTimerRef.current = null;
      }
      return;
    }

    if (showSelectedPageLoading) {
      return;
    }

    // Page loaded but 0 blocks — wait briefly for sync to deliver blocks
    if (emptySettleTimerRef.current !== null) return;
    emptySettleTimerRef.current = window.setTimeout(() => {
      emptySettleTimerRef.current = null;
      setBlocksSettled(true);
    }, 150);

    return () => {
      if (emptySettleTimerRef.current !== null) {
        window.clearTimeout(emptySettleTimerRef.current);
        emptySettleTimerRef.current = null;
      }
    };
  }, [blockCount, blocksSettled, showSelectedPageLoading]);

  const handleFirstBlockReady = useCallback(() => {
    setBlocksSettled(true);
  }, []);

  const blockTreeRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node === null) {
      setBlocksSettled(false);
    }
  }, []);

  // The single editor manages its own loading, so don't gate it on the
  // per-block settling overlay (which only clears via NotesBlockTree).
  const showBlocksSettling = !useSingleEditor && (!blocksSettled || isLoadingTags);

  if (showSelectedPageLoading) {
    return (
      <div className="mx-auto h-full max-w-3xl">
        <NotesEditorMainSkeleton />
      </div>
    );
  }

  if (!editorContent) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-sm text-muted-foreground">
        This page is not available locally.
      </div>
    );
  }

  return (
    <div className="notes-reading relative mx-auto max-w-3xl min-h-[200px]">
      <div className={showBlocksSettling ? "pointer-events-none opacity-0 transition-opacity duration-100" : "transition-opacity duration-150"}>
        <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-1.5 md:gap-x-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${shouldAnimateEditorContent ? "animate-fade-slide-in" : ""}`}>
          <NotesEditorHeader
            editorContent={editorContent}
            showEditorOverlay={showEditorOverlay}
            shouldAnimateEditorContent={shouldAnimateEditorContent}
            pageTitleDraft={pageTitleDraft}
            pageTitleError={pageTitleError}
            isEmojiPickerOpen={isEmojiPickerOpen}
            activePageEmoji={activePageEmoji}
            selectedTagIdsDraft={selectedTagIdsDraft}
            allTags={allTags}
            isLoadingTags={isLoadingTags}
            onBack={onBack}
            onTitleChange={onTitleChange}
            onCommitTitle={onCommitTitle}
            onToggleFavorite={onToggleFavorite}
            onEmojiPickerOpenChange={onEmojiPickerOpenChange}
            onSelectEmoji={onSelectEmoji}
            onSelectedTagIdsChange={onSelectedTagIdsChange}
            onCopyDocument={onCopyDocument}
            onOpenDeleteDialog={onOpenDeleteDialog}
          />

          {editorContent.pageId ? (
            <NotePageProperties
              pageId={editorContent.pageId}
              pageProperties={selectedPageProperties}
              shouldAnimate={shouldAnimateEditorContent}
            />
          ) : null}

          {useSingleEditor && editorContent.pageId ? (
            <SingleBlockEditor
              key={editorContent.pageId}
              pageId={editorContent.pageId}
              handlers={{ notePageTitles, onOpenPageReference, onPeekPageReference }}
              onEditorChange={onSingleEditorChange}
            />
          ) : (
          <div ref={blockTreeRefCallback} className={`col-span-2 sm:col-start-2 sm:col-span-2 pt-2 ${shouldAnimateEditorContent ? "animate-fade-slide-in" : ""}`}>
            <NotesBlockTree
              blocks={editorContent.blocks}
              onCreateFirstBlock={onCreateFirstBlock}
              focusedBlockId={focusTarget?.blockId ?? null}
              focusPlacement={focusTarget?.placement ?? "end"}
              onFocusApplied={onFocusApplied}
              onFocusBlock={onFocusBlock}
              notePageTitles={notePageTitles}
              onOpenPageReference={onOpenPageReference}
              onPeekPageReference={onPeekPageReference}
              onCreateSibling={onCreateSibling}
              onCreateEmptySibling={onCreateEmptySibling}
              onCreateSiblings={onCreateSiblings}
              onMergeWithPrevious={onMergeWithPrevious}
              onCommitContent={onCommitContent}
              onIndent={onIndent}
              onOutdent={onOutdent}
              onMoveSelectedBlockRange={onMoveSelectedBlockRange}
              onDelete={onDelete}
              onDeleteRange={onDeleteRange}
              onUpdateContent={onUpdateContent}
              onFirstBlockReady={handleFirstBlockReady}
              onEditorRef={onEditorRef}
              onConvertBlockType={onConvertBlockType}
            />
          </div>
          )}
        </div>
      </div>
      {showBlocksSettling ? (
        <div className="pointer-events-none absolute inset-0 bg-background">
          <NotesEditorMainSkeleton />
        </div>
      ) : null}
    </div>
  );
}