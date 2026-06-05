"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";

import { useQuery } from "@powersync/react";

import {
  useLinkedNoteReferences,
  useNotePageWithBlocks,
  usePageAttachments,
  usePageTagMentions,
  type LinkedNoteReferenceRow,
  type NoteAttachmentRow,
  type NoteBlockRow,
  type NotePageRow,
  type NoteTagMentionRow,
} from "@/hooks/use-notes";
import { usePropertyDefinitions } from "@/hooks/use-property-definitions";
import { useSettledTimestamp } from "@/hooks/use-settled-timestamp";
import type { Tag } from "@/lib/powersync/AppSchema";

import { NotesEditorContent } from "./NotesEditorContent";
import { NotesEditorMainSkeleton } from "@/components/notes/NotesPageSkeleton";
import { useNoteBlockStoreActions } from "./useNoteBlockStoreActions";
import { useNotePageActions } from "./useNotePageActions";
import { buildOutlineEntries, formatTimestampLabel, normalizePageEmoji, parseProperties, parseStoredTagIds, resolveNoteTags } from "./utils";
import type { NormalizedNotePage, NoteTag, OutlineEntry } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotePageShellProps = {
  pageId: string;
  notePageTitles: string[];
  notePageIdByTitle: Map<string, string>;
  onNavigateToPage: (pageId: string, title?: string) => void;
  onDeleteSuccess: () => void;
  onPeekPageReference?: (title: string, rect: DOMRect) => void;
  onReady?: () => void;
  onUndoStateChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onSummaryDraftChange?: (summary: string) => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

export const NotePageShell = forwardRef<NotePageShellHandle, NotePageShellProps>(function NotePageShell({
  pageId,
  notePageTitles,
  notePageIdByTitle,
  onNavigateToPage,
  onDeleteSuccess,
  onPeekPageReference,
  onReady,
  onUndoStateChange,
  onSummaryDraftChange,
}, ref) {
  // ─── Queries (gate rendering) ──────────────────────────────────────────────
  const { page, blocks: selectedBlocks, isLoading: isLoadingPage } = useNotePageWithBlocks(pageId);
  const { attachments, isLoading: isLoadingAttachments } = usePageAttachments(pageId);
  const { references: linkedReferences, isLoading: isLoadingLinkedReferences } = useLinkedNoteReferences(pageId);
  const { definitions: propertyDefinitions, isLoading: isLoadingPropertyDefs } = usePropertyDefinitions();
  const { data: availableTags = [] } = useQuery<Tag>("SELECT * FROM tags ORDER BY name ASC");

  // Lazy-loaded (not gating)
  const { tags: pageTagMentions, isLoading: isLoadingTagMentions } = usePageTagMentions(pageId);

  // ─── Page-level derived state ──────────────────────────────────────────────
  const pageProperties = useMemo(
    () => parseProperties(page?.properties ?? null),
    [page?.properties]
  );
  const pageTagIds = useMemo(
    () => parseStoredTagIds(pageProperties.tags),
    [pageProperties.tags]
  );
  const pageTags = useMemo(
    () => resolveNoteTags(pageTagIds, availableTags),
    [pageTagIds, availableTags]
  );
  const pageEmoji = useMemo(
    () => normalizePageEmoji(pageProperties.emoji),
    [pageProperties.emoji]
  );
  const pageSummary = typeof pageProperties.summary === "string" ? pageProperties.summary : null;
  const createdTimestamp = formatTimestampLabel(page?.created_at ?? null);
  const updatedTimestamp = formatTimestampLabel(page?.updated_at ?? null);

  // ─── Draft state ───────────────────────────────────────────────────────────
  const [pageTitleDraft, setPageTitleDraft] = useState("");
  const [pageTitleError, setPageTitleError] = useState<string | null>(null);
  const [pageEmojiDraft, setPageEmojiDraft] = useState<string | null | undefined>(undefined);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [selectedTagIdsDraft, setSelectedTagIdsDraft] = useState<string[]>([]);
  const [isDeletingPage, setIsDeletingPage] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // ─── Hydration on page data arrival ────────────────────────────────────────
  const hydratedPageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!page || page.id !== pageId) return;
    if (hydratedPageIdRef.current === pageId) return;

    hydratedPageIdRef.current = pageId;
    setPageTitleDraft(page.title ?? "");
    setPageTitleError(null);
    setPageEmojiDraft(undefined);
    setSummaryDraft(pageSummary ?? "");
    setSelectedTagIdsDraft(pageTagIds);
  }, [page?.id, pageId]);

  // Reset drafts when switching pages (before new data arrives)
  const prevPageIdRef = useRef(pageId);
  useEffect(() => {
    if (prevPageIdRef.current === pageId) return;
    prevPageIdRef.current = pageId;
    hydratedPageIdRef.current = null;
    setPageTitleError(null);
    setPageEmojiDraft(undefined);
    setSummaryDraft("");
    setSelectedTagIdsDraft([]);
  }, [pageId]);

  // Emoji draft reconciliation
  useEffect(() => {
    if (!page || pageEmojiDraft === undefined) return;
    if (pageEmojiDraft === pageEmoji) {
      setPageEmojiDraft(undefined);
    }
  }, [pageEmojiDraft, page?.id, pageEmoji]);

  // ─── Block store ───────────────────────────────────────────────────────────
  const {
    store,
    displayBlocks,
    orderedVisibleBlockIds,
    blockMap: selectedBlockMap,
    focusTarget,
    setFocusTarget,
    canUndo,
    canRedo,
    undo,
    redo,
    handleCommitBlockContent,
    handleConvertBlockType,
    handleCreateEmptySiblingBlock,
    handleCreateRootBlock,
    handleCreateSiblingBlock,
    handleCreateSiblingBlocks,
    handleDeleteBlock,
    handleDeleteBlockRange,
    handleIndentBlock,
    handleMergeWithPreviousBlock,
    handleMoveSelectedBlockRange,
    handleOutdentBlock,
    handleUpdateBlockContent,
  } = useNoteBlockStoreActions({ pageId, selectedBlocks });

  // Propagate undo/redo availability to the parent (shell owns the store lifecycle).
  useEffect(() => {
    onUndoStateChange?.({ canUndo, canRedo });
  }, [canUndo, canRedo, onUndoStateChange]);

  // Keep parent-controlled consumers (details rail) in sync with local summary draft edits.
  useEffect(() => {
    onSummaryDraftChange?.(summaryDraft);
  }, [summaryDraft, onSummaryDraftChange]);

  // ─── Settled timestamp ─────────────────────────────────────────────────────
  const {
    stableUpdatedTimestamp,
    showAbsoluteUpdatedTime,
    revealAbsoluteUpdatedTime,
    resetTimestamp,
  } = useSettledTimestamp(page, updatedTimestamp);

  // Reset timestamp on hydration
  useEffect(() => {
    if (page?.id === pageId && hydratedPageIdRef.current === pageId) {
      resetTimestamp(updatedTimestamp);
    }
  }, [hydratedPageIdRef.current]);

  // ─── Page actions ──────────────────────────────────────────────────────────
  const activePageEmoji = pageEmojiDraft !== undefined ? pageEmojiDraft : pageEmoji;

  const {
    commitPageTitleDraft,
    handleCopyDocument,
    handleDeletePage,
    handleSelectPageEmoji,
    handleToggleFavorite,
    persistSelectedPageProperties,
    togglePageFavorite,
  } = useNotePageActions({
    selectedPageId: pageId,
    selectedPage: page,
    selectedPageProperties: pageProperties,
    selectedPageSummary: pageSummary,
    selectedPageTags: pageTags,
    pageTitleDraft,
    activePageEmoji,
    summaryDraft,
    selectedTagIdsDraft,
    displayBlocks,
    orderedVisibleBlockIds,
    selectedBlockMap,
    setPageTitleDraft,
    setPageTitleError,
    setPageEmojiDraft,
    setIsEmojiPickerOpen,
    setIsDeletingPage,
    setIsDeleteDialogOpen,
    onDeleteSuccess,
  });

  // ─── Editor ref registration ───────────────────────────────────────────────
  const handleEditorRef = useCallback(
    (blockId: string, editor: Editor | null) => {
      store.setEditorRef(blockId, editor);
    },
    [store],
  );

  // ─── Outline ───────────────────────────────────────────────────────────────
  const pageOutline = useMemo(
    () => buildOutlineEntries(displayBlocks),
    [displayBlocks]
  );

  // ─── Loading gate ──────────────────────────────────────────────────────────
  const isReady = Boolean(page && page.id === pageId && !isLoadingPage && !isLoadingPropertyDefs);

  // ─── Global Ctrl+Z / Ctrl+Y keyboard shortcuts for page-level undo/redo ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isReady) return;

      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z";
      const isRedo = (e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z") || (e.shiftKey && e.key === "Z"));

      if (!isUndo && !isRedo) return;

      // If a Tiptap editor is focused and can handle undo/redo itself, let it
      const activeEl = document.activeElement;
      const prosemirror = activeEl?.closest(".ProseMirror");
      if (prosemirror) return; // Tiptap handles it

      e.preventDefault();
      if (isUndo) {
        undo();
      } else {
        redo();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isReady, undo, redo]);

  // Notify parent when shell becomes ready (triggers re-render so ref reads pick up new values)
  const prevIsReadyRef = useRef(false);
  useEffect(() => {
    if (isReady && !prevIsReadyRef.current) {
      onReady?.();
    }
    prevIsReadyRef.current = isReady;
  }, [isReady, onReady]);

  // ─── Imperative handle for parent access ───────────────────────────────────
  useImperativeHandle(ref, () => ({
    linkedReferences,
    pageTagMentions,
    attachments,
    pageOutline,
    summaryDraft,
    setSummaryDraft,
    selectedTagIdsDraft,
    createdTimestamp,
    isLoadingLinkedReferences,
    isLoadingTagMentions,
    isLoadingAttachments,
    persistSelectedPageProperties,
    stableUpdatedTimestamp,
    showAbsoluteUpdatedTime,
    revealAbsoluteUpdatedTime,
    handleToggleFavorite,
    handleCopyDocument,
    handleDeletePage,
    isDeletingPage,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    pageTitleDraft,
    activePageEmoji,
    selectedPageProperties: pageProperties,
    page: page ?? null,
    displayBlocks,
    setFocusTarget: (target) => setFocusTarget(target),
    togglePageFavorite,
    isReady,
    undo,
    redo,
    canUndo,
    canRedo,
  }));

  // ─── Focus callbacks ───────────────────────────────────────────────────────
  const handleFocusApplied = useCallback(() => {
    setFocusTarget(null);
  }, []);

  const handleFocusBlock = useCallback((blockId: string, placement: "start" | "end") => {
    setFocusTarget({ blockId, placement });
  }, []);

  const handleOpenPageReference = useCallback((title: string) => {
    const targetPageId = notePageIdByTitle.get(title.trim().toLocaleLowerCase());
    if (targetPageId) {
      onNavigateToPage(targetPageId, title.trim());
    }
  }, [notePageIdByTitle, onNavigateToPage]);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!isReady) {
    return (
      <div className="mx-auto h-full max-w-3xl">
        <NotesEditorMainSkeleton />
      </div>
    );
  }

  const editorContent = {
    pageId,
    title: pageTitleDraft || page!.title || "Untitled page",
    emoji: activePageEmoji,
    favorite: pageProperties.favorite === true,
    tags: pageTags,
    blockCount: displayBlocks.length,
    backlinkCount: linkedReferences.length,
    blocks: displayBlocks,
  };

  return (
    <NotesEditorContent
      editorContent={editorContent}
      showSelectedPageLoading={false}
      showEditorOverlay={false}
      shouldAnimateEditorContent={false}
      pageTitleDraft={pageTitleDraft}
      pageTitleError={pageTitleError}
      isEmojiPickerOpen={isEmojiPickerOpen}
      activePageEmoji={activePageEmoji}
      selectedTagIdsDraft={selectedTagIdsDraft}
      focusTarget={focusTarget}
      notePageTitles={notePageTitles}
      selectedPageProperties={pageProperties}
      onBack={() => onNavigateToPage("__back__")}
      onTitleChange={(value) => {
        setPageTitleDraft(value);
        setPageTitleError(null);
      }}
      onCommitTitle={commitPageTitleDraft}
      onToggleFavorite={handleToggleFavorite}
      onEmojiPickerOpenChange={setIsEmojiPickerOpen}
      onSelectEmoji={handleSelectPageEmoji}
      onSelectedTagIdsChange={(nextTagIds) => {
        setSelectedTagIdsDraft(nextTagIds);
        persistSelectedPageProperties(summaryDraft, nextTagIds);
      }}
      onCopyDocument={handleCopyDocument}
      onOpenDeleteDialog={() => setIsDeleteDialogOpen(true)}
      onCreateFirstBlock={handleCreateRootBlock}
      onFocusApplied={handleFocusApplied}
      onFocusBlock={handleFocusBlock}
      onOpenPageReference={handleOpenPageReference}
      onPeekPageReference={onPeekPageReference}
      onCreateSibling={handleCreateSiblingBlock}
      onCreateEmptySibling={handleCreateEmptySiblingBlock}
      onCreateSiblings={handleCreateSiblingBlocks}
      onMergeWithPrevious={handleMergeWithPreviousBlock}
      onCommitContent={handleCommitBlockContent}
      onIndent={handleIndentBlock}
      onOutdent={handleOutdentBlock}
      onMoveSelectedBlockRange={handleMoveSelectedBlockRange}
      onDelete={handleDeleteBlock}
      onDeleteRange={handleDeleteBlockRange}
      onUpdateContent={handleUpdateBlockContent}
      onEditorRef={handleEditorRef}
      onConvertBlockType={handleConvertBlockType}
    />
  );
});

// ─── Hook for parent to access shell state (details rail, timestamps, etc.) ──

export type NotePageShellHandle = {
  linkedReferences: LinkedNoteReferenceRow[];
  pageTagMentions: NoteTagMentionRow[];
  attachments: NoteAttachmentRow[];
  pageOutline: OutlineEntry[];
  summaryDraft: string;
  setSummaryDraft: (summary: string) => void;
  selectedTagIdsDraft: string[];
  createdTimestamp: { relative: string; absolute: string; dateOnly: string } | null;
  isLoadingLinkedReferences: boolean;
  isLoadingTagMentions: boolean;
  isLoadingAttachments: boolean;
  persistSelectedPageProperties: (summary: string, tagIds: string[]) => void;
  stableUpdatedTimestamp: { relative: string; absolute: string } | null;
  showAbsoluteUpdatedTime: boolean;
  revealAbsoluteUpdatedTime: () => void;
  handleToggleFavorite: () => void;
  handleCopyDocument: () => Promise<void>;
  handleDeletePage: () => Promise<void>;
  isDeletingPage: boolean;
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
  pageTitleDraft: string;
  activePageEmoji: string | null;
  selectedPageProperties: Record<string, unknown>;
  page: NotePageRow | null;
  displayBlocks: NoteBlockRow[];
  setFocusTarget: (target: { blockId: string; placement: "start" | "end" }) => void;
  togglePageFavorite: (page: NormalizedNotePage) => void;
  isReady: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};
