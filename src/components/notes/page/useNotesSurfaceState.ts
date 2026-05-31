"use client";

import { useEffect, useRef, useState } from "react";

import type { NoteBlockRow } from "@/hooks/use-notes";

import type { NormalizedNotePage, NoteTag, NotesEditorRenderableContent } from "./types";

type UseNotesSurfaceStateParams = {
  selectedPageId: string | null;
  isLoading: boolean;
  isLoadingSelectedPage: boolean;
  favoritePages: NormalizedNotePage[];
  recentAccessPages: NormalizedNotePage[];
  selectedPageIdForEditor: string | null | undefined;
  selectedPageTitle: string | null | undefined;
  activePageEmoji: string | null;
  isSelectedPageFavorite: boolean;
  selectedPageTags?: NoteTag[];
  selectedBlockCount: number;
  linkedReferenceCount: number;
  displayBlocks: NoteBlockRow[];
  updatedTimestamp: { relative: string; absolute: string } | null;
};

export function useNotesSurfaceState({
  selectedPageId,
  isLoading,
  isLoadingSelectedPage,
  favoritePages,
  recentAccessPages,
  selectedPageIdForEditor,
  selectedPageTitle,
  activePageEmoji,
  isSelectedPageFavorite,
  selectedPageTags = [],
  selectedBlockCount,
  linkedReferenceCount,
  displayBlocks,
  updatedTimestamp,
}: UseNotesSurfaceStateParams) {
  const [pendingSurfaceKey, setPendingSurfaceKey] = useState<string | null>(null);
  const resolvedSurfaceKey = selectedPageId ? `editor:${selectedPageId}` : "overview";
  const displaySurfaceKey = pendingSurfaceKey ?? resolvedSurfaceKey;
  const isDisplayingOverview = displaySurfaceKey === "overview";

  // Clear pending key once resolved matches (instant, no timer)
  useEffect(() => {
    if (!pendingSurfaceKey) return;
    if (pendingSurfaceKey === resolvedSurfaceKey) {
      setPendingSurfaceKey(null);
    }
  }, [pendingSurfaceKey, resolvedSurfaceKey]);

  // Loading states: pass through directly, no artificial delay
  const showOverviewLoading = isDisplayingOverview && isLoading;
  const showSelectedPageLoading = !isDisplayingOverview && (displaySurfaceKey !== resolvedSurfaceKey || isLoadingSelectedPage);

  // Track whether we've loaded content for the current page (for entrance animation)
  const hasRenderedOverviewRef = useRef(false);
  const hasRenderedEditorRef = useRef(false);
  const previousEditorPageIdRef = useRef<string | null | undefined>(selectedPageIdForEditor);

  // Reset editor animation flag when navigating to a different page
  if (selectedPageIdForEditor !== previousEditorPageIdRef.current) {
    previousEditorPageIdRef.current = selectedPageIdForEditor;
    hasRenderedEditorRef.current = false;
  }

  if (!showOverviewLoading && isDisplayingOverview && favoritePages.length + recentAccessPages.length > 0) {
    hasRenderedOverviewRef.current = true;
  }
  if (!showSelectedPageLoading && !isDisplayingOverview && selectedPageIdForEditor) {
    hasRenderedEditorRef.current = true;
  }

  const shouldAnimateOverviewContent = !hasRenderedOverviewRef.current && !showOverviewLoading;
  const shouldAnimateEditorContent = !hasRenderedEditorRef.current && !showSelectedPageLoading;

  const liveEditorContent: NotesEditorRenderableContent = selectedPageIdForEditor
    ? {
        pageId: selectedPageIdForEditor,
        title: selectedPageTitle || "Untitled page",
        emoji: activePageEmoji,
        favorite: isSelectedPageFavorite,
        tags: selectedPageTags,
        blockCount: selectedBlockCount,
        backlinkCount: linkedReferenceCount,
        blocks: displayBlocks.length > 0 && displayBlocks[0].page_id !== selectedPageIdForEditor ? [] : displayBlocks,
      }
    : null;

  return {
    editorContentToRender: liveEditorContent,
    editorUpdatedTimestamp: liveEditorContent ? updatedTimestamp : null,
    isDisplayingOverview,
    overviewFavoritePagesToRender: favoritePages,
    overviewRecentPagesToRender: recentAccessPages,
    shouldAnimateEditorContent,
    shouldAnimateOverviewContent,
    showEditorOverlay: false,
    showOverviewLoading,
    showOverviewOverlay: false,
    showSelectedPageLoading,
    transitionToEditor: (pageId: string) => setPendingSurfaceKey(`editor:${pageId}`),
    transitionToOverview: () => setPendingSurfaceKey("overview"),
  };
}