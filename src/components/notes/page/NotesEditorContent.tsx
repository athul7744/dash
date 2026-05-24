"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { NotesBlockTree } from "@/components/notes/NotesBlockTree";
import { NotesEditorMainSkeleton } from "@/components/notes/NotesPageSkeleton";
import type { JsonValue, NoteBlockInsert } from "@/lib/notes/notes";

import { NotesEditorHeader } from "./NotesEditorHeader";
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
}) {
  const [blocksSettled, setBlocksSettled] = useState(false);
  const blockTreeRef = useRef<HTMLDivElement | null>(null);
  const blockCount = editorContent?.blocks.length ?? 0;

  useEffect(() => {
    if (blocksSettled) return;

    if (blockCount === 0) {
      if (!showSelectedPageLoading) {
        setBlocksSettled(true);
      }
      return;
    }

    const container = blockTreeRef.current;
    if (!container) return;

    if (container.querySelector(".ProseMirror")) {
      setBlocksSettled(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (container.querySelector(".ProseMirror")) {
        observer.disconnect();
        setBlocksSettled(true);
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [blockCount, blocksSettled, showSelectedPageLoading]);

  const blockTreeRefCallback = useCallback((node: HTMLDivElement | null) => {
    blockTreeRef.current = node;
    if (node === null) {
      setBlocksSettled(false);
    }
  }, []);

  const showBlocksSettling = !blocksSettled;

  if (showSelectedPageLoading && (!editorContent || blockCount === 0)) {
    return (
      <div className="mx-auto max-w-3xl">
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
    <div className="relative mx-auto max-w-3xl min-h-[200px]">
      <div className={showBlocksSettling ? "pointer-events-none opacity-0 transition-opacity duration-100" : "transition-opacity duration-150"}>
        <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-4 md:gap-x-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${shouldAnimateEditorContent ? "animate-fade-slide-in" : ""}`}>
          <NotesEditorHeader
            editorContent={editorContent}
            showEditorOverlay={showEditorOverlay}
            shouldAnimateEditorContent={shouldAnimateEditorContent}
            pageTitleDraft={pageTitleDraft}
            pageTitleError={pageTitleError}
            isEmojiPickerOpen={isEmojiPickerOpen}
            activePageEmoji={activePageEmoji}
            selectedTagIdsDraft={selectedTagIdsDraft}
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

          <div ref={blockTreeRefCallback} className={`col-span-2 sm:col-start-2 sm:col-span-2 ${shouldAnimateEditorContent ? "animate-fade-slide-in" : ""}`}>
            <NotesBlockTree
              blocks={editorContent.blocks}
              onCreateFirstBlock={onCreateFirstBlock}
              focusedBlockId={focusTarget?.blockId ?? null}
              focusPlacement={focusTarget?.placement ?? "end"}
              onFocusApplied={onFocusApplied}
              onFocusBlock={onFocusBlock}
              notePageTitles={notePageTitles}
              onOpenPageReference={onOpenPageReference}
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
            />
          </div>
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