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
import { buildNoteBlockTree, flattenNoteBlockTree } from "@/lib/notes/notes-tree";
import { useNotePageActions } from "./useNotePageActions";
import { buildOutlineEntries, formatTimestampLabel, normalizePageEmoji, parseProperties, parseStoredTagIds, resolveNoteTags } from "./utils";
import type { NormalizedNotePage, OutlineEntry } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotePageShellProps = {
  pageId: string;
  notePageTitles: string[];
  notePageIdByTitle: Map<string, string>;
  onNavigateToPage: (pageId: string, title?: string) => void;
  onDeleteSuccess: () => void;
  onPeekPageReference?: (title: string, rect: DOMRect) => void;
  onStateChange?: (handle: NotePageShellHandle) => void;
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
  onStateChange,
  onUndoStateChange,
  onSummaryDraftChange,
}, ref) {
  // ─── Queries (gate rendering) ──────────────────────────────────────────────
  const { page, blocks: selectedBlocks, isLoading: isLoadingPage } = useNotePageWithBlocks(pageId);
  const { attachments, isLoading: isLoadingAttachments } = usePageAttachments(pageId);
  const { references: linkedReferences, isLoading: isLoadingLinkedReferences } = useLinkedNoteReferences(pageId);
  const { isLoading: isLoadingPropertyDefs } = usePropertyDefinitions();
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
  // Memoized so the forwarded shell handle keeps a stable identity across renders.
  const createdTimestamp = useMemo(() => formatTimestampLabel(page?.created_at ?? null), [page?.created_at]);
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

  // ─── Ordered blocks (read-only: outline, copy-document, block count) ─────────
  // The single editor owns editing + undo; the shell only needs the page's
  // blocks in document order for the outline and copy actions.
  const selectedBlockMap = useMemo(
    () => new Map(selectedBlocks.map((block) => [block.id, block])),
    [selectedBlocks],
  );
  const orderedVisibleBlockIds = useMemo(() => {
    const byRank = [...selectedBlocks].sort((a, b) => (a.sort_rank ?? "").localeCompare(b.sort_rank ?? ""));
    return flattenNoteBlockTree(buildNoteBlockTree(byRank));
  }, [selectedBlocks]);
  const displayBlocks = useMemo(
    () => orderedVisibleBlockIds.map((id) => selectedBlockMap.get(id)).filter(Boolean) as NoteBlockRow[],
    [orderedVisibleBlockIds, selectedBlockMap],
  );

  // ─── Single-document editor undo/redo ───────────────────────────────────────
  // Undo/redo is the single editor's ONE native ProseMirror history — both
  // Ctrl+Z and the toolbar buttons drive it, so they can't diverge.
  const [singleEditor, setSingleEditor] = useState<Editor | null>(null);
  const [singleUndo, setSingleUndo] = useState({ canUndo: false, canRedo: false });
  const singleEditorRef = useRef<Editor | null>(null);
  useEffect(() => {
    singleEditorRef.current = singleEditor;
  }, [singleEditor]);

  // Track the editor's history availability reactively (can().undo() is a plain
  // query, so recompute on every transaction).
  useEffect(() => {
    if (!singleEditor) return;
    const sync = () => {
      const next = { canUndo: singleEditor.can().undo(), canRedo: singleEditor.can().redo() };
      setSingleUndo((prev) => (prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next));
    };
    singleEditor.on("transaction", sync);
    return () => {
      singleEditor.off("transaction", sync);
    };
  }, [singleEditor]);

  const effectiveCanUndo = singleEditor ? singleUndo.canUndo : false;
  const effectiveCanRedo = singleEditor ? singleUndo.canRedo : false;

  const runUndo = useCallback(() => {
    singleEditorRef.current?.commands.undo();
  }, []);
  const runRedo = useCallback(() => {
    singleEditorRef.current?.commands.redo();
  }, []);

  // Outline click → focus a block by id in the single editor (scroll + cursor).
  const focusBlockInEditor = useCallback((target: { blockId: string; placement: "start" | "end" }) => {
    const editor = singleEditorRef.current;
    if (!editor) return;
    let pos: number | null = null;
    editor.state.doc.descendants((node, p) => {
      if (pos !== null) return false;
      if (node.type.name === "block" && node.attrs.blockId === target.blockId) {
        pos = p;
        return false;
      }
      return true;
    });
    if (pos !== null) editor.chain().focus().setTextSelection(pos + 2).scrollIntoView().run();
  }, []);

  // Propagate undo/redo availability to the parent (shell owns the store lifecycle).
  useEffect(() => {
    onUndoStateChange?.({ canUndo: effectiveCanUndo, canRedo: effectiveCanRedo });
  }, [effectiveCanUndo, effectiveCanRedo, onUndoStateChange]);

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
        runUndo();
      } else {
        runRedo();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isReady, runUndo, runRedo]);

  // ─── Imperative handle + state forwarding to parent ────────────────────────
  // The parent renders overview/editor chrome from this handle and reads it from
  // React state (never a ref during render, which `react-hooks/refs` forbids).
  //
  // Several callbacks (from useNotePageActions / useSettledTimestamp) are new
  // references on every render, so they can't go straight into the memo deps or
  // the handle would change identity every render and the onStateChange effect
  // would loop. Instead we keep the latest callbacks in a ref (updated after each
  // render) and expose STABLE wrapper functions that delegate to them. The
  // handle then only depends on the (referentially stable) data fields.
  const latestCallbacksRef = useRef({
    setSummaryDraft,
    persistSelectedPageProperties,
    revealAbsoluteUpdatedTime,
    handleToggleFavorite,
    handleCopyDocument,
    handleDeletePage,
    setIsDeleteDialogOpen,
    focusBlockInEditor,
    togglePageFavorite,
    undo: runUndo,
    redo: runRedo,
  });
  useEffect(() => {
    latestCallbacksRef.current = {
      setSummaryDraft,
      persistSelectedPageProperties,
      revealAbsoluteUpdatedTime,
      handleToggleFavorite,
      handleCopyDocument,
      handleDeletePage,
      setIsDeleteDialogOpen,
      focusBlockInEditor,
      togglePageFavorite,
      undo: runUndo,
      redo: runRedo,
    };
  });

  const stableCallbacks = useMemo(() => ({
    setSummaryDraft: (summary: string) => latestCallbacksRef.current.setSummaryDraft(summary),
    persistSelectedPageProperties: (summary: string, tagIds: string[]) => latestCallbacksRef.current.persistSelectedPageProperties(summary, tagIds),
    revealAbsoluteUpdatedTime: () => latestCallbacksRef.current.revealAbsoluteUpdatedTime(),
    handleToggleFavorite: () => latestCallbacksRef.current.handleToggleFavorite(),
    handleCopyDocument: () => latestCallbacksRef.current.handleCopyDocument(),
    handleDeletePage: () => latestCallbacksRef.current.handleDeletePage(),
    setIsDeleteDialogOpen: (open: boolean) => latestCallbacksRef.current.setIsDeleteDialogOpen(open),
    setFocusTarget: (target: { blockId: string; placement: "start" | "end" }) => latestCallbacksRef.current.focusBlockInEditor(target),
    togglePageFavorite: (favoritePage: NormalizedNotePage) => latestCallbacksRef.current.togglePageFavorite(favoritePage),
    undo: () => latestCallbacksRef.current.undo(),
    redo: () => latestCallbacksRef.current.redo(),
  }), []);

  const shellHandle = useMemo<NotePageShellHandle>(() => ({
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
    stableUpdatedTimestamp,
    showAbsoluteUpdatedTime,
    isDeletingPage,
    isDeleteDialogOpen,
    pageTitleDraft,
    activePageEmoji,
    selectedPageProperties: pageProperties,
    page: page ?? null,
    displayBlocks,
    isReady,
    canUndo: effectiveCanUndo,
    canRedo: effectiveCanRedo,
    ...stableCallbacks,
  }), [
    linkedReferences, pageTagMentions, attachments, pageOutline, summaryDraft, selectedTagIdsDraft,
    createdTimestamp, isLoadingLinkedReferences, isLoadingTagMentions, isLoadingAttachments,
    stableUpdatedTimestamp, showAbsoluteUpdatedTime, isDeletingPage, isDeleteDialogOpen, pageTitleDraft,
    activePageEmoji, pageProperties, page, displayBlocks, isReady, effectiveCanUndo, effectiveCanRedo, stableCallbacks,
  ]);

  useImperativeHandle(ref, () => shellHandle, [shellHandle]);

  useEffect(() => {
    onStateChange?.(shellHandle);
  }, [shellHandle, onStateChange]);

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
      onOpenPageReference={handleOpenPageReference}
      onPeekPageReference={onPeekPageReference}
      onSingleEditorChange={setSingleEditor}
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
