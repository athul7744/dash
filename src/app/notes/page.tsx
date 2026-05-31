"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Columns3, Copy, Ellipsis, Files, NotebookTabs, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Star, Tag as TagIcon, Trash2 } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { NotesDetailsRailSkeleton, NotesPageSkeleton } from "@/components/notes/NotesPageSkeleton";
import { NotesPageBreadcrumb } from "@/components/notes/NotesPageBreadcrumb";
import { MobileRailDrawer } from "../../components/notes/MobileRailDrawer";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SEARCH_POPUP_CLOSE_ANIMATION_MS } from "@/components/ui/search-popup";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAllNotePages, useLinkedNoteReferences, useNoteCounts, useNotePageWithBlocks, usePageAttachments, usePageTagMentions, useRecentNotePages } from "@/hooks/use-notes";
import { createStarterPage, flushPendingNoteEdgeReconciles, hasPendingNoteEdgeReconciles, normalizeNotePageTitle } from "@/lib/notes/notes";
import { getApp } from "@/lib/shared/apps";
import { flushAllUpdates, hasPendingWrites } from "@/lib/shared/debounced-update";
import {
  type OptimisticBlockStructure,
} from "@/components/notes/page/types";
import { NotesDetailsRail } from "@/components/notes/page/NotesDetailsRail";
import { NotesEditorContent } from "@/components/notes/page/NotesEditorContent";
import { NotesNavigationRail, NotesNavigationRailHeader } from "@/components/notes/page/NotesNavigationRail";
import { NotesOverview } from "@/components/notes/page/NotesOverview";
import { useNoteBlockActions } from "@/components/notes/page/useNoteBlockActions";
import { useNotePageActions } from "@/components/notes/page/useNotePageActions";
import { NotesPageSearchPopup } from "@/components/notes/page/NotesPageSearchPopup";
import { useNotesPageDerivedState } from "@/components/notes/page/useNotesPageDerivedState";
import { useNotesLayoutState } from "@/components/notes/page/useNotesLayoutState";
import { useNotesSurfaceState } from "@/components/notes/page/useNotesSurfaceState";
import { buildOutlineEntries } from "@/components/notes/page/utils";
import { ManagePropertiesDialog } from "@/components/notes/ManagePropertiesDialog";
import { ManageTagsDialog } from "@/components/tasks/ManageTagsDialog";
import { useEdgeSwipe } from "@/hooks/use-edge-swipe";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePageNavStack } from "@/hooks/use-page-nav-stack";
import { useSettledTimestamp } from "@/hooks/use-settled-timestamp";
import { usePagePeek } from "@/components/notes/usePagePeek";
import { PagePeekPopover } from "@/components/notes/PagePeekPopover";

const notesApp = getApp("notes");

export default function NotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPageId = searchParams.get("page");
  const selectedPageIdForWrite: string | undefined = selectedPageId ?? undefined;
  const navStack = usePageNavStack();
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  const [isPageSearchOpen, setIsPageSearchOpen] = useState(false);
  const [pageSearchQuery, setPageSearchQuery] = useState("");
  const [pageTitleDraft, setPageTitleDraft] = useState("");
  const [pageTitleError, setPageTitleError] = useState<string | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pageEmojiDraft, setPageEmojiDraft] = useState<string | null | undefined>(undefined);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [selectedTagIdsDraft, setSelectedTagIdsDraft] = useState<string[]>([]);
  const [blockContentDrafts, setBlockContentDrafts] = useState<Record<string, string>>({});
  const [optimisticBlockStructure, setOptimisticBlockStructure] = useState<Record<string, OptimisticBlockStructure>>({});
  const [focusTarget, setFocusTarget] = useState<{ blockId: string; placement: number | "start" | "end" } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingPage, setIsDeletingPage] = useState(false);
  const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
  const [isManagePropertiesOpen, setIsManagePropertiesOpen] = useState(false);
  const {
    showEditorAppHeader,
    setShowEditorAppHeader,
    showDesktopPagesRail,
    setShowDesktopPagesRail,
    showDesktopDetailsRail,
    setShowDesktopDetailsRail,
    isMobilePagesDrawerOpen,
    setIsMobilePagesDrawerOpen,
    isMobileDetailsDrawerOpen,
    setIsMobileDetailsDrawerOpen,
    pageRailSectionOpen,
    tagDirectoryOpen,
    setTagDirectoryOpen,
    detailsSectionOpen,
    setDetailsSectionOpen,
    togglePageRailSection,
    toggleTagDirectoryGroup,
    toggleDetailsSection,
    areAllPageRailSectionsOpen,
    toggleAllPageRailSections,
  } = useNotesLayoutState();
  const isMobileViewport = useMediaQuery("(max-width: 639px)");

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasPendingWrites() && !hasPendingNoteEdgeReconciles()) {
        return;
      }

      flushAllUpdates();
      void flushPendingNoteEdgeReconciles();
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);



  const { isLoading: isLoadingCounts } = useNoteCounts();
  const { pages: allPages = [] } = useAllNotePages();
  const { pages: recentPages = [], isLoading: isLoadingRecentPages } = useRecentNotePages(8);
  const { page: selectedPage, blocks: selectedBlocks, isLoading: isLoadingSelectedPage } = useNotePageWithBlocks(selectedPageId);
  const { attachments: selectedPageAttachments, isLoading: isLoadingAttachments } = usePageAttachments(selectedPageId);
  const { references: linkedReferences, isLoading: isLoadingLinkedReferences } = useLinkedNoteReferences(selectedPageId);
  const { tags: pageTagMentions, isLoading: isLoadingTagMentions } = usePageTagMentions(selectedPageId);

  const handleCreateStarterPage = async () => {
    setPageSearchQuery("");
    setIsPageSearchOpen(true);
  };
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
    selectedPageId,
    selectedPageIdForWrite,
    isCreatingBlock,
    currentFocusTarget: focusTarget,
    blockContentDrafts,
    optimisticBlockStructure,
    setIsCreatingBlock,
    setBlockContentDrafts,
    setOptimisticBlockStructure,
    setFocusTarget,
  });

  const {
    canCreatePageFromSearch,
    createdTimestamp,
    displayBlocks,
    favoritePages,
    filteredSearchPages,
    normalizedPages,
    normalizedSearchQuery,
    notePageIdByTitle,
    notePageTitles,
    pageOutline,
    recentAccessPages,
    selectedPageEmoji,
    selectedPageProperties,
    selectedPageSummary,
    selectedPageTagIds,
    selectedPageTags,
    tagDirectory,
    updatedTimestamp,
  } = useNotesPageDerivedState({
    allPages,
    recentPages,
    selectedPage,
    structuredBlocks,
    blockContentDrafts,
    pageSearchQuery,
  });
  const activePageEmoji = pageEmojiDraft !== undefined
    ? pageEmojiDraft
    : selectedPageEmoji;
  const {
    stableUpdatedTimestamp,
    showAbsoluteUpdatedTime,
    revealAbsoluteUpdatedTime,
    resetTimestamp,
  } = useSettledTimestamp(selectedPage, updatedTimestamp);
  const hydratedPageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedPageId) {
      hydratedPageIdRef.current = null;
      setPageTitleDraft("");
      setPageTitleError(null);
      setPageEmojiDraft(undefined);
      setSummaryDraft("");
      setSelectedTagIdsDraft([]);
      setBlockContentDrafts({});
      setOptimisticBlockStructure({});
      resetTimestamp(null);
      setFocusTarget(null);
      return;
    }

    // Clear drafts immediately when switching to a different page to prevent stale content flash
    // Note: pageTitleDraft is NOT cleared here — it's pre-set by navigation handlers
    // so the breadcrumb title stays stable during transitions.
    if (hydratedPageIdRef.current !== null && hydratedPageIdRef.current !== selectedPageId) {
      setPageTitleError(null);
      setPageEmojiDraft(undefined);
      setSummaryDraft("");
      setSelectedTagIdsDraft([]);
      setBlockContentDrafts({});
      setOptimisticBlockStructure({});
      setFocusTarget(null);
    }

    if (!selectedPage || selectedPage.id !== selectedPageId) {
      return;
    }

    if (hydratedPageIdRef.current === selectedPageId) {
      return;
    }

    hydratedPageIdRef.current = selectedPageId;

    setPageTitleDraft(selectedPage.title ?? "");
    setPageTitleError(null);
    setPageEmojiDraft(undefined);
    setSummaryDraft(selectedPageSummary ?? "");
    setSelectedTagIdsDraft(selectedPageTagIds);
    setBlockContentDrafts({});
    setOptimisticBlockStructure({});
    resetTimestamp(updatedTimestamp);
    setFocusTarget(null);
  }, [selectedPage?.id, selectedPageId]);

  useEffect(() => {
    if (!selectedPage || pageEmojiDraft === undefined) {
      return;
    }

    if (pageEmojiDraft === selectedPageEmoji) {
      setPageEmojiDraft(undefined);
    }
  }, [pageEmojiDraft, selectedPage?.id, selectedPageEmoji]);

  useEffect(() => {
    setOptimisticBlockStructure((current) => {
      const optimisticIds = Object.keys(current);
      if (optimisticIds.length === 0) {
        return current;
      }

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

  useEffect(() => {
    setTagDirectoryOpen((current) => {
      const selectedTagKeys = new Set(selectedPageTags.map((tag) => tag.key));
      const next: Record<string, boolean> = {};
      let hasChanged = Object.keys(current).length !== tagDirectory.length;

      tagDirectory.forEach((entry, index) => {
        const nextValue = current[entry.key] ?? (selectedTagKeys.has(entry.key) || index === 0);
        next[entry.key] = nextValue;

        if (current[entry.key] !== nextValue) {
          hasChanged = true;
        }
      });

      return hasChanged ? next : current;
    });
  }, [selectedPageTags, tagDirectory]);

  const isLoading = isLoadingCounts || isLoadingRecentPages;

  const {
    editorContentToRender,
    editorUpdatedTimestamp,
    isDisplayingOverview,
    overviewFavoritePagesToRender,
    overviewRecentPagesToRender,
    shouldAnimateEditorContent,
    shouldAnimateOverviewContent,
    showEditorOverlay,
    showOverviewLoading,
    showOverviewOverlay,
    showSelectedPageLoading,
    transitionToEditor,
    transitionToOverview,
  } = useNotesSurfaceState({
    selectedPageId,
    isLoading,
    isLoadingSelectedPage,
    favoritePages,
    recentAccessPages,
    selectedPageIdForEditor: selectedPageId,
    selectedPageTitle: pageTitleDraft || selectedPage?.title || "Untitled page",
    activePageEmoji,
    isSelectedPageFavorite: selectedPageProperties.favorite === true,
    selectedPageTags,
    selectedBlockCount: displayBlocks.length,
    linkedReferenceCount: linkedReferences.length,
    displayBlocks,
    updatedTimestamp: stableUpdatedTimestamp,
  });
  const renderedPageOutline = useMemo(
    () => buildOutlineEntries(editorContentToRender?.blocks ?? []),
    [editorContentToRender?.blocks]
  );

  useEffect(() => {
    const nextState = {
      outline: true,
      summary: true,
      references: true,
      mentions: true,
      attachments: true,
    };

    setDetailsSectionOpen((current) => {
      if (
        current.outline === nextState.outline &&
        current.summary === nextState.summary &&
        current.references === nextState.references &&
        current.mentions === nextState.mentions &&
        current.attachments === nextState.attachments
      ) {
        return current;
      }

      return nextState;
    });
  }, [linkedReferences.length, pageTagMentions.length, renderedPageOutline.length, selectedPage?.id, selectedPageAttachments.length, selectedPageSummary, selectedPageTags.length]);

  const openPageById = (pageId: string, targetTitle?: string) => {
    // Push current page (or overview) onto navigation stack before navigating away
    if (selectedPageId) {
      navStack.push({ pageId: selectedPageId, title: pageTitleDraft || selectedPage?.title || "Untitled" });
    } else {
      navStack.push({ pageId: "__overview__", title: "Overview" });
    }
    if (targetTitle) {
      setPageTitleDraft(targetTitle);
    }
    transitionToEditor(pageId);
    startTransition(() => {
      router.push(`/notes?page=${pageId}`);
    });
  };

  const handleBreadcrumbNavigate = (pageId: string) => {
    const entry = navStack.stack.find((e) => e.pageId === pageId);
    navStack.popTo(pageId);
    if (pageId === "__overview__") {
      transitionToOverview();
      router.push("/notes");
    } else {
      if (entry) setPageTitleDraft(entry.title);
      transitionToEditor(pageId);
      startTransition(() => { router.push(`/notes?page=${pageId}`); });
    }
  };

  const handleFocusApplied = useCallback(() => {
    setFocusTarget(null);
  }, []);

  const handleFocusBlock = useCallback((blockId: string, placement: "start" | "end") => {
    setFocusTarget({ blockId, placement });
  }, []);

  const handleSelectPageFromSearch = (pageId: string) => {
    setIsPageSearchOpen(false);
    openPageById(pageId);
  };

  const handleCreatePageFromSearch = async (title: string) => {
    const normalizedTitle = normalizeNotePageTitle(title);
    if (!normalizedTitle || isCreatingPage) return;

    const existingPageId = notePageIdByTitle.get(normalizedTitle.toLocaleLowerCase());
    if (existingPageId) {
      handleSelectPageFromSearch(existingPageId);
      return;
    }

    setIsCreatingPage(true);

    try {
      const pageId = await createStarterPage(normalizedTitle);
      setIsPageSearchOpen(false);
      openPageById(pageId, normalizedTitle);
    } finally {
      setIsCreatingPage(false);
    }
  };

  const handleOpenPageReference = (title: string) => {
    const targetPageId = notePageIdByTitle.get(title.trim().toLocaleLowerCase());
    if (!targetPageId) {
      return;
    }

    openPageById(targetPageId, title.trim());
  };

  const { peekTarget, openPeek, closePeek } = usePagePeek();

  const handlePeekPageReference = useCallback((title: string, rect: DOMRect) => {
    openPeek({ pageTitle: title, anchorRect: rect });
  }, [openPeek]);

  const handlePeekNavigate = useCallback((title: string) => {
    closePeek();
    const targetPageId = notePageIdByTitle.get(title.trim().toLocaleLowerCase());
    if (targetPageId) {
      openPageById(targetPageId, title.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closePeek, notePageIdByTitle]);

  const overviewSearchTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isPageSearchOpen || pageSearchQuery.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPageSearchQuery("");
    }, SEARCH_POPUP_CLOSE_ANIMATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isPageSearchOpen, pageSearchQuery]);



  const {
    commitPageTitleDraft,
    handleCopyDocument,
    handleDeletePage,
    handleSelectPageEmoji,
    handleToggleFavorite,
    persistSelectedPageProperties,
    togglePageFavorite,
  } = useNotePageActions({
    selectedPageId,
    selectedPage,
    selectedPageProperties,
    selectedPageSummary,
    selectedPageTags,
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
    onDeleteSuccess: () => {
      transitionToOverview();
      startTransition(() => {
        router.push("/notes");
      });
    },
  });

  const showDesktopUpdatedTimestamp = Boolean(editorUpdatedTimestamp && !isLoading && !showSelectedPageLoading && selectedPage);
  const showMobileUpdatedTimestamp = Boolean(editorUpdatedTimestamp);
  const desktopChromeIconButtonClass = "size-8 rounded-full text-muted-foreground transition-[color,background-color,box-shadow] duration-200 hover:bg-accent/60 hover:text-foreground hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.5)] md:size-9";
  const desktopChromeTextButtonClass = "inline-flex h-8 w-fit items-center justify-self-start px-0 text-[11px] text-muted-foreground/80 transition-colors duration-200 hover:text-foreground";
  const desktopGridColumns = showDesktopPagesRail && showDesktopDetailsRail
    ? "sm:grid-cols-[280px_minmax(0,1fr)_320px]"
    : showDesktopPagesRail
      ? "sm:grid-cols-[280px_minmax(0,1fr)_44px]"
      : showDesktopDetailsRail
        ? "sm:grid-cols-[44px_minmax(0,1fr)_320px]"
        : "sm:grid-cols-[44px_minmax(0,1fr)_44px]";

  const desktopPagesRestoreButton = !showDesktopPagesRail ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setShowDesktopPagesRail(true)}
      className="hidden size-8 rounded-full text-muted-foreground hover:text-foreground sm:inline-flex"
      aria-label="Show pages panel"
    >
      <PanelLeftOpen className="h-4 w-4" />
    </Button>
  ) : null;

  const desktopDetailsRestoreButton = !showDesktopDetailsRail ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setShowDesktopDetailsRail(true)}
      className="hidden size-8 rounded-full text-muted-foreground hover:text-foreground sm:inline-flex"
      aria-label="Show details panel"
    >
      <PanelRightOpen className="h-4 w-4" />
    </Button>
  ) : null;

  const desktopDetailsRailHeader = showDesktopDetailsRail ? (
    <div className="hidden w-full items-center justify-between gap-3 sm:flex">
      <p className="text-sm font-semibold text-foreground">Details</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setShowDesktopDetailsRail(false)}
        className="size-8 rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Hide details panel"
      >
        <PanelRightClose className="h-4 w-4" />
      </Button>
    </div>
  ) : null;

  const navigationRail = (
    <NotesNavigationRail
      isLoading={isLoading}
      normalizedPages={normalizedPages}
      favoritePages={favoritePages}
      recentAccessPages={recentAccessPages}
      tagDirectory={tagDirectory}
      tagDirectoryOpen={tagDirectoryOpen}
      pageRailSectionOpen={pageRailSectionOpen}
      selectedPageId={selectedPageId}
      areAllSectionsOpen={areAllPageRailSectionsOpen}
      onToggleAllSections={toggleAllPageRailSections}
      onTogglePageRailSection={togglePageRailSection}
      onToggleTagDirectoryGroup={toggleTagDirectoryGroup}
      onSelectPage={(pageId) => {
        if (selectedPageId) {
          navStack.push({ pageId: selectedPageId, title: pageTitleDraft || selectedPage?.title || "Untitled" });
        } else {
          navStack.push({ pageId: "__overview__", title: "Overview" });
        }
        transitionToEditor(pageId);
      }}
    />
  );

  const detailsRail = (
    <NotesDetailsRail
      selectedPage={selectedPage}
      detailsSectionOpen={detailsSectionOpen}
      pageOutline={renderedPageOutline}
      summaryDraft={summaryDraft}
      selectedTagIdsDraft={selectedTagIdsDraft}
      linkedReferences={linkedReferences}
      pageTagMentions={pageTagMentions}
      selectedPageAttachments={selectedPageAttachments}
      createdTimestamp={createdTimestamp}
      isLoadingLinkedReferences={isLoadingLinkedReferences}
      isLoadingTagMentions={isLoadingTagMentions}
      isLoadingAttachments={isLoadingAttachments}
      onToggleDetailsSection={toggleDetailsSection}
      onSetSummaryDraft={setSummaryDraft}
      onPersistSelectedPageProperties={persistSelectedPageProperties}
      onSetFocusTarget={setFocusTarget}
      onNavigateToPage={openPageById}
    />
  );

  const edgeSwipeEnabled = isMobileViewport && !isDeleteDialogOpen && !isPageSearchOpen && !isMobilePagesDrawerOpen && !isMobileDetailsDrawerOpen;
  const { handleTouchStart: handleMobileEdgeSwipeStart, handleTouchEnd: handleMobileEdgeSwipeEnd } = useEdgeSwipe(
    edgeSwipeEnabled,
    {
      onSwipeLeft: () => {
        setIsMobileDetailsDrawerOpen(false);
        setIsMobilePagesDrawerOpen(true);
      },
      onSwipeRight: () => {
        if (detailsRail || showSelectedPageLoading) {
          setIsMobilePagesDrawerOpen(false);
          setIsMobileDetailsDrawerOpen(true);
        }
      },
    },
  );

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background"
      onTouchStart={handleMobileEdgeSwipeStart}
      onTouchEnd={handleMobileEdgeSwipeEnd}
    >
      {isDisplayingOverview || showEditorAppHeader ? (
        <AppHeader
          app={notesApp}
          mobileMenuItems={isDisplayingOverview ? (
            <>
              <DropdownMenuItem onClick={() => setIsManageTagsOpen(true)}>
                <div className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-0.5 py-0.5 text-sm outline-none transition-colors">
                  <TagIcon className="h-4 w-4" />
                  Manage Tags
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsManagePropertiesOpen(true)}>
                <div className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-0.5 py-0.5 text-sm outline-none transition-colors">
                  <Columns3 className="h-4 w-4" />
                  Manage Properties
                </div>
              </DropdownMenuItem>
            </>
          ) : undefined}
          actions={isDisplayingOverview ? (
            <>
              <ManageTagsDialog />
              <ManageTagsDialog open={isManageTagsOpen} onOpenChange={setIsManageTagsOpen} hideTrigger />
              <ManagePropertiesDialog />
              <ManagePropertiesDialog open={isManagePropertiesOpen} onOpenChange={setIsManagePropertiesOpen} hideTrigger />
              <Button
                onClick={handleCreateStarterPage}
                variant="ghost"
                size="sm"
                disabled={isCreatingPage}
                className="gap-1.5 rounded-full text-xs h-8 px-2.5 hover:text-amber-700 dark:hover:text-amber-400"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isCreatingPage ? "Creating..." : "Page"}</span>
              </Button>
            </>
          ) : undefined}
        />
      ) : null}

      <main className={`flex-1 overflow-y-auto overflow-x-hidden px-[var(--app-gutter-x)] pb-[var(--mobile-bottom-fab-clearance)] sm:overflow-hidden sm:pb-4 ${isDisplayingOverview ? "pt-0 md:pt-0 md:pb-8" : "py-4 md:py-8 md:pb-8"}`}>
        <div className="mx-auto max-w-[1600px] space-y-4 sm:flex sm:h-full sm:min-h-0 sm:flex-col sm:space-y-0">
          {isDisplayingOverview ? (
            <NotesOverview
              isPageSearchOpen={isPageSearchOpen}
              overviewSearchTriggerRef={overviewSearchTriggerRef}
              overviewFavoritePagesToRender={overviewFavoritePagesToRender}
              overviewRecentPagesToRender={overviewRecentPagesToRender}
              showOverviewOverlay={showOverviewOverlay}
              showOverviewLoading={showOverviewLoading}
              shouldAnimateOverviewContent={shouldAnimateOverviewContent}
              onOpenSearch={() => setIsPageSearchOpen(true)}
              onSelectPage={(pageId) => {
                if (selectedPageId) {
                  navStack.push({ pageId: selectedPageId, title: pageTitleDraft || selectedPage?.title || "Untitled" });
                } else {
                  navStack.push({ pageId: "__overview__", title: "Overview" });
                }
                transitionToEditor(pageId);
              }}
              onToggleFavorite={togglePageFavorite}
            />
          ) : (
            <>
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 sm:hidden">
                <MobileRailDrawer
                  direction="left"
                  triggerIcon={NotebookTabs}
                  triggerLabel="Pages"
                  title="Pages"
                  description="Browse and create notes pages."
                  open={isMobilePagesDrawerOpen}
                  onOpenChange={setIsMobilePagesDrawerOpen}
                >
                  {navigationRail}
                </MobileRailDrawer>

                <div className="min-w-0 flex flex-1 items-center justify-center gap-1.5 px-2 text-center">
                  {showMobileUpdatedTimestamp ? (
                    <button
                      type="button"
                      onClick={revealAbsoluteUpdatedTime}
                      key={editorUpdatedTimestamp?.absolute}
                      className="inline-flex max-w-full items-center justify-center truncate text-[11px] text-muted-foreground/75 animate-fade-slide-in-soft transition-colors hover:text-foreground"
                    >
                      {showAbsoluteUpdatedTime ? editorUpdatedTimestamp?.absolute : `Edited ${editorUpdatedTimestamp?.relative}`}
                    </button>
                  ) : <span className="block h-4" aria-hidden="true" />}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowEditorAppHeader((current) => !current)}
                    className="size-8 shrink-0 rounded-full text-muted-foreground transition-[color,background-color,box-shadow] duration-200 hover:bg-accent/60 hover:text-foreground hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.5)]"
                    aria-label={showEditorAppHeader ? "Hide app header" : "Show app header"}
                  >
                    {showEditorAppHeader ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </Button>
                </div>

                {detailsRail || showSelectedPageLoading ? (
                  <MobileRailDrawer
                    direction="right"
                    triggerIcon={Files}
                    triggerLabel="Details"
                    title="Details"
                    description="Outline, references, summary, and attachments for the current page."
                    open={isMobileDetailsDrawerOpen}
                    onOpenChange={setIsMobileDetailsDrawerOpen}
                  >
                    {detailsRail ?? <NotesDetailsRailSkeleton />}
                  </MobileRailDrawer>
                ) : <div />}
              </div>

              <section className={`grid gap-4 sm:h-full sm:min-h-0 sm:grid-rows-[auto_minmax(0,1fr)] sm:gap-y-2 ${desktopGridColumns}`}>
                {showDesktopPagesRail ? (
                  <div className="hidden h-9 items-center sm:flex">
                    <NotesNavigationRailHeader
                      showDesktopPagesRail={showDesktopPagesRail}
                      areAllSectionsOpen={areAllPageRailSectionsOpen}
                      onToggleAllSections={toggleAllPageRailSections}
                      onHideDesktopPagesRail={() => setShowDesktopPagesRail(false)}
                    />
                  </div>
                ) : (
                  <div className="hidden h-9 items-center justify-center sm:flex">
                    {desktopPagesRestoreButton}
                  </div>
                )}

                <div className="hidden h-9 items-center sm:flex">
                  <div className="mx-auto grid w-full max-w-3xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 md:gap-x-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const prev = navStack.pop();
                        if (prev && prev.pageId !== "__overview__") {
                          setPageTitleDraft(prev.title);
                          transitionToEditor(prev.pageId);
                          startTransition(() => { router.push(`/notes?page=${prev.pageId}`); });
                        } else {
                          transitionToOverview();
                          router.push("/notes");
                        }
                      }}
                      className={`-ml-2 -mr-1 flex shrink-0 items-center justify-center ${desktopChromeIconButtonClass}`}
                      aria-label="Back to notes list"
                    >
                      <ArrowLeft className="h-6 w-6 md:h-7 md:w-7" />
                    </Button>
                    {showDesktopUpdatedTimestamp ? (
                      <button
                        type="button"
                        onClick={revealAbsoluteUpdatedTime}
                        key={editorUpdatedTimestamp?.absolute}
                        className={`${desktopChromeTextButtonClass} animate-fade-slide-in-soft`}
                      >
                        {showAbsoluteUpdatedTime ? editorUpdatedTimestamp?.absolute : `Edited ${editorUpdatedTimestamp?.relative}`}
                      </button>
                    ) : <span className="block h-4 w-32" aria-hidden="true" />}
                    <div className="flex items-center justify-self-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowEditorAppHeader((current) => !current)}
                        className={desktopChromeIconButtonClass}
                        aria-label={showEditorAppHeader ? "Hide app header" : "Show app header"}
                      >
                        {showEditorAppHeader ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleToggleFavorite}
                        className={`${desktopChromeIconButtonClass} ${selectedPageProperties.favorite === true ? "text-amber-500 hover:text-amber-500" : ""}`}
                        aria-label="Toggle favorite"
                      >
                        <Star className={`h-4 w-4 ${selectedPageProperties.favorite === true ? "fill-current" : ""}`} />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger className={`inline-flex items-center justify-center ${desktopChromeIconButtonClass}`} aria-label="Page actions">
                          <Ellipsis className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => {
                              void handleCopyDocument();
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            Copy document
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              setIsMobileDetailsDrawerOpen(false);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete page
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>

                {showDesktopDetailsRail ? (
                  <div className="hidden h-9 items-center sm:flex">
                    {desktopDetailsRailHeader}
                  </div>
                ) : (
                  <div className="hidden h-9 items-center justify-center sm:flex">
                    {desktopDetailsRestoreButton}
                  </div>
                )}

                {showDesktopPagesRail ? (
                  <aside className="hidden sm:block sm:min-h-0 sm:overflow-hidden">{navigationRail}</aside>
                ) : <div className="hidden sm:block" aria-hidden="true" />}

                <section className="min-w-0 sm:min-h-0 sm:overflow-y-auto">
                  {navStack.stack.length > 0 && !isDisplayingOverview && (
                    <div className="mx-auto hidden max-w-3xl px-3 pt-1 sm:block sm:px-0">
                      <NotesPageBreadcrumb
                        stack={navStack.stack}
                        currentTitle={pageTitleDraft || selectedPage?.title || ""}
                        onNavigate={handleBreadcrumbNavigate}
                      />
                    </div>
                  )}
                  <NotesEditorContent
                    editorContent={editorContentToRender}
                    showSelectedPageLoading={showSelectedPageLoading}
                    showEditorOverlay={showEditorOverlay}
                    shouldAnimateEditorContent={shouldAnimateEditorContent}
                    pageTitleDraft={pageTitleDraft}
                    pageTitleError={pageTitleError}
                    isEmojiPickerOpen={isEmojiPickerOpen}
                    activePageEmoji={activePageEmoji}
                    selectedTagIdsDraft={selectedTagIdsDraft}
                    focusTarget={focusTarget}
                    notePageTitles={notePageTitles}
                    selectedPageProperties={selectedPageProperties}
                    onBack={() => {
                      const prev = navStack.pop();
                      if (prev && prev.pageId !== "__overview__") {
                        setPageTitleDraft(prev.title);
                        transitionToEditor(prev.pageId);
                        startTransition(() => { router.push(`/notes?page=${prev.pageId}`); });
                      } else {
                        transitionToOverview();
                        router.push("/notes");
                      }
                    }}
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
                    onOpenDeleteDialog={() => {
                      setIsMobileDetailsDrawerOpen(false);
                      setIsDeleteDialogOpen(true);
                    }}
                    onCreateFirstBlock={handleCreateRootBlock}
                    onFocusApplied={handleFocusApplied}
                    onFocusBlock={handleFocusBlock}
                    onOpenPageReference={handleOpenPageReference}
                    onPeekPageReference={handlePeekPageReference}
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
                </section>

                {showDesktopDetailsRail ? (
                  <aside className="hidden sm:flex sm:min-h-0 sm:overflow-hidden">{detailsRail ?? (showSelectedPageLoading ? <NotesDetailsRailSkeleton showHeader={false} /> : null)}</aside>
                ) : <div className="hidden sm:block" aria-hidden="true" />}
              </section>
            </>
          )}
        </div>
      </main>

      <MobileBottomFabs
        app={notesApp}
        centerUseShell={!isDisplayingOverview && navStack.stack.length > 0}
        centerShellClassName={!isDisplayingOverview && navStack.stack.length > 0 ? "max-w-[55vw] px-2.5 py-1.5" : undefined}
        centerContent={isDisplayingOverview ? (
          <Button
            onClick={handleCreateStarterPage}
            size="icon"
            disabled={isCreatingPage}
            className="size-12 rounded-full border border-amber-200 bg-amber-100 text-amber-700 shadow-lg transition-all duration-200 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/80 dark:text-amber-300 dark:hover:bg-amber-800"
            aria-label="Create new page"
          >
            <Plus className="h-5 w-5" />
          </Button>
        ) : navStack.stack.length > 0 && !isDisplayingOverview ? (
          <NotesPageBreadcrumb
            stack={navStack.stack}
            currentTitle={pageTitleDraft || selectedPage?.title || ""}
            onNavigate={handleBreadcrumbNavigate}
          />
        ) : undefined}
      />

      <NotesPageSearchPopup
        open={isPageSearchOpen}
        query={pageSearchQuery}
        titleToCreate={normalizedSearchQuery}
        filteredPages={filteredSearchPages}
        canCreatePage={canCreatePageFromSearch}
        isCreatingPage={isCreatingPage}
        anchorRef={overviewSearchTriggerRef}
        onOpenChange={setIsPageSearchOpen}
        onQueryChange={setPageSearchQuery}
        onSelectPage={handleSelectPageFromSearch}
        onCreatePage={handleCreatePageFromSearch}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete page?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the page, its blocks, attachments, and local note links. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPage}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePage}
              disabled={isDeletingPage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingPage ? "Deleting..." : "Delete page"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {peekTarget && (
        <PagePeekPopover
          target={peekTarget}
          onClose={closePeek}
          onNavigate={handlePeekNavigate}
        />
      )}
    </div>
  );
}