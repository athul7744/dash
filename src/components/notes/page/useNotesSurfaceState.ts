"use client";

import { useEffect, useRef, useState } from "react";

import type { NormalizedNotePage } from "./types";

type UseNotesSurfaceStateParams = {
  selectedPageId: string | null;
  isLoading: boolean;
  isLoadingSelectedPage: boolean;
  favoritePages: NormalizedNotePage[];
  recentAccessPages: NormalizedNotePage[];
  selectedPageIdForEditor: string | null | undefined;
  updatedTimestamp: { relative: string; absolute: string } | null;
};

export function useNotesSurfaceState({
  selectedPageId,
  isLoading,
  isLoadingSelectedPage,
  favoritePages,
  recentAccessPages,
  selectedPageIdForEditor,
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

  const hasEditorContent = Boolean(selectedPageIdForEditor);

  return {
    editorUpdatedTimestamp: hasEditorContent ? updatedTimestamp : null,
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