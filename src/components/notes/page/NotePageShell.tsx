"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

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
import type { JsonValue } from "@/lib/notes/notes";
import type { Tag } from "@/lib/powersync/AppSchema";

import { NotesEditorContent } from "./NotesEditorContent";
import { NotesEditorMainSkeleton } from "@/components/notes/NotesPageSkeleton";
import { useNoteBlockActions } from "./useNoteBlockActions";
import { useNotePageActions } from "./useNotePageActions";
import { buildOutlineEntries, formatTimestampLabel, normalizePageEmoji, parseProperties, parseStoredTagIds, resolveNoteTags } from "./utils";
import type { NormalizedNotePage, NoteTag, OptimisticBlockStructure, OutlineEntry } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotePageShellProps = {
  pageId: string;
  notePageTitles: string[];
  notePageIdByTitle: Map<string, string>;
  onNavigateToPage: (pageId: string, title?: string) => void;
  onDeleteSuccess: () => void;
  onPeekPageReference?: (title: string, rect: DOMRect) => void;
  onReady?: () => void;
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
  const [blockContentDrafts, setBlockContentDrafts] = useState<Record<string, string>>({});
  const [optimisticBlockStructure, setOptimisticBlockStructure] = useState<Record<string, OptimisticBlockStructure>>({});
  const [focusTarget, setFocusTarget] = useState<{ blockId: string; placement: number | "start" | "end" } | null>(null);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
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
    setBlockContentDrafts({});
    setOptimisticBlockStructure({});
    setFocusTarget(null);
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
    setBlockContentDrafts({});
    setOptimisticBlockStructure({});
    setFocusTarget(null);
  }, [pageId]);

  // Emoji draft reconciliation
  useEffect(() => {
    if (!page || pageEmojiDraft === undefined) return;
    if (pageEmojiDraft === pageEmoji) {
      setPageEmojiDraft(undefined);
    }
  }, [pageEmojiDraft, page?.id, pageEmoji]);

  // Optimistic structure reconciliation
  useEffect(() => {
    setOptimisticBlockStructure((current) => {
      const optimisticIds = Object.keys(current);
      if (optimisticIds.length === 0) return current;

      const selectedBlockById = new Map(selectedBlocks.map((block) => [block.id, block]));
      let hasChanged = false;
      const next = { ...current };

      optimisticIds.forEach((blockId) => {
        const optimisticMove = current[blockId];
        const selectedBlock = selectedBlockById.get(blockId);

        if (!selectedBlock) {
          delete next[blockId];
          hasChanged = true;
          return;
        }

        if (
          (selectedBlock.parent_block_id ?? null) === optimisticMove.parent_block_id &&
          selectedBlock.sort_rank === optimisticMove.sort_rank
        ) {
          delete next[blockId];
          hasChanged = true;
        }
      });

      return hasChanged ? next : current;
    });
  }, [selectedBlocks]);

  // ─── Block actions ─────────────────────────────────────────────────────────
  const {
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
    orderedVisibleBlockIds,
    selectedBlockMap,
    structuredBlocks,
  } = useNoteBlockActions({
    selectedBlocks,
    selectedPageId: pageId,
    selectedPageIdForWrite: pageId,
    isCreatingBlock,
    currentFocusTarget: focusTarget,
    blockContentDrafts,
    optimisticBlockStructure,
    setIsCreatingBlock,
    setBlockContentDrafts,
    setOptimisticBlockStructure,
    setFocusTarget,
  });

  // ─── Display blocks (with draft overlays) ─────────────────────────────────
  const displayBlocks = useMemo(
    () => structuredBlocks.map((block) => ({
      ...block,
      content: blockContentDrafts[block.id] ?? block.content,
    })),
    [blockContentDrafts, structuredBlocks]
  );

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
    blockContentDrafts,
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

  // ─── Outline ───────────────────────────────────────────────────────────────
  const pageOutline = useMemo(
    () => buildOutlineEntries(displayBlocks),
    [displayBlocks]
  );

  // ─── Loading gate ──────────────────────────────────────────────────────────
  const isReady = Boolean(page && page.id === pageId && !isLoadingPage && !isLoadingPropertyDefs);

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
      <div className="mx-auto max-w-3xl">
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
};
