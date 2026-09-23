"use client";

import { useDerivedState } from "@/hooks/use-derived-state";

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
  const resolvedSurfaceKey = selectedPageId ? `editor:${selectedPageId}` : "overview";
  const [pendingSurfaceKey, setPendingSurfaceKey] = useDerivedState<string, string | null>(
    resolvedSurfaceKey,
    () => null,
  );
  const displaySurfaceKey = pendingSurfaceKey ?? resolvedSurfaceKey;
  const isDisplayingOverview = displaySurfaceKey === "overview";

  // Loading states: pass through directly, no artificial delay
  const showOverviewLoading = isDisplayingOverview && isLoading;
  const showSelectedPageLoading = !isDisplayingOverview && (displaySurfaceKey !== resolvedSurfaceKey || isLoadingSelectedPage);

  const hasEditorContent = Boolean(selectedPageIdForEditor);

  return {
    editorUpdatedTimestamp: hasEditorContent ? updatedTimestamp : null,
    isDisplayingOverview,
    overviewFavoritePagesToRender: favoritePages,
    overviewRecentPagesToRender: recentAccessPages,
    showEditorOverlay: false,
    showOverviewLoading,
    showOverviewOverlay: false,
    showSelectedPageLoading,
    transitionToEditor: (pageId: string) => setPendingSurfaceKey(`editor:${pageId}`),
    transitionToOverview: () => setPendingSurfaceKey("overview"),
  };
}