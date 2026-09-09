"use client";

import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Columns3, Files, Network, NotebookTabs, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Redo2, Tag as TagIcon, Undo2 } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { NotesDetailsRailSkeleton } from "@/components/notes/NotesPageSkeleton";
import { NotesPageBreadcrumb } from "@/components/notes/NotesPageBreadcrumb";
import { MobileRailDrawer } from "@/components/notes/MobileRailDrawer";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAllNotePages, useFavoriteNotePages, useNoteCounts, useRecentNotePages } from "@/hooks/use-notes";
import { createStarterPage, normalizeNotePageTitle, updateNotePageProperties } from "@/lib/notes/notes";
import { flushAllBlockDocumentPersisters } from "@/lib/notes/editor/block-persister";
import { getApp, HEADER_ACTION_BASE, HEADER_ACTION_NEUTRAL } from "@/lib/shared/apps";
import { useNewItemParam } from "@/hooks/use-new-item-param";
import { cn } from "@/lib/shared/utils";
import { flushAllUpdates, hasPendingWrites } from "@/lib/shared/debounced-update";
import { NotesDetailsRail } from "@/components/notes/page/NotesDetailsRail";
import { NotesEditorChromeBar } from "@/components/notes/page/NotesEditorChromeBar";
import { NotePageShell, type NotePageShellHandle } from "@/components/notes/page/NotePageShell";
import { NotesNavigationRail, NotesNavigationRailHeader } from "@/components/notes/page/NotesNavigationRail";
import { NotesOverview } from "@/components/notes/page/NotesOverview";
import { NotesGraphView } from "@/components/notes/graph/NotesGraphView";
import { NotesPageSearchPopup } from "@/components/notes/page/NotesPageSearchPopup";
import { useNotesPageDerivedState } from "@/components/notes/page/useNotesPageDerivedState";
import { useNotesLayoutState } from "@/components/notes/page/useNotesLayoutState";
import { useNotesSurfaceState } from "@/components/notes/page/useNotesSurfaceState";
import { useNotesNavigation } from "@/components/notes/page/useNotesNavigation";
import { parseProperties } from "@/components/notes/page/utils";
import { ManagePropertiesDialog } from "@/components/notes/ManagePropertiesDialog";
import { ManageTagsDialog } from "@/components/tasks/ManageTagsDialog";
import { useEdgeSwipe } from "@/hooks/use-edge-swipe";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePageNavStack } from "@/hooks/use-page-nav-stack";
import { usePagePeek } from "@/components/notes/usePagePeek";
import { PagePeekPopover } from "@/components/notes/PagePeekPopover";
import type { NormalizedNotePage } from "@/components/notes/page/types";

const notesApp = getApp("notes");

/** How many recently-accessed pages to load per infinite-scroll batch. */
const RECENT_PAGE_SIZE = 16;

/**
 * The full notes workspace — pages rail, chrome, and the current surface
 * (overview / editor / graph). Rendered from the notes *layout* so it persists
 * across `[[...slug]]` param changes and sits above the route loading boundary:
 * navigating between surfaces never remounts it or flashes a full-page skeleton
 * over the persistent rail. The surface is derived from the pathname.
 */
export function NotesWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  // The first path segment selects the surface: `/notes/graph` is the vault
  // graph, `/notes/<id>` opens that note, bare `/notes` is the overview.
  const slug = pathname.startsWith("/notes/") ? decodeURIComponent(pathname.slice("/notes/".length).split("/")[0]) : null;
  const graphView = slug === "graph";
  const selectedPageId = graphView ? null : (slug || null);
  const navStack = usePageNavStack();
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [isPageSearchOpen, setIsPageSearchOpen] = useState(false);
  const [pageSearchQuery, setPageSearchQuery] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
  const [isManagePropertiesOpen, setIsManagePropertiesOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
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

  // Shell state pushed up from the editor shell via onStateChange, so the parent
  // reads page-level state from React state (not a ref during render).
  const [shellHandle, setShellHandle] = useState<NotePageShellHandle | null>(null);

  // Undo/redo availability is pushed up from the shell (which owns the store lifecycle),
  // so the parent re-renders the toolbar buttons immediately on any edit.
  const [undoState, setUndoState] = useState<{ canUndo: boolean; canRedo: boolean }>({ canUndo: false, canRedo: false });
  const handleUndoStateChange = useCallback((state: { canUndo: boolean; canRedo: boolean }) => {
    setUndoState((prev) => (prev.canUndo === state.canUndo && prev.canRedo === state.canRedo ? prev : state));
  }, []);
  const canUndo = undoState.canUndo;
  const canRedo = undoState.canRedo;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasPendingWrites()) {
        return;
      }

      flushAllUpdates();
      flushAllBlockDocumentPersisters();
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ─── Overview-level data ─────────────────────────────────────────────────
  const { isLoading: isLoadingCounts } = useNoteCounts();
  const { pages: allPages = [] } = useAllNotePages();
  // Recently accessed loads incrementally as the user scrolls (infinite scroll).
  const [recentLimit, setRecentLimit] = useState(RECENT_PAGE_SIZE);
  const { pages: recentPages = [], isLoading: isLoadingRecentPages } = useRecentNotePages(recentLimit);
  const { pages: favoritePageRows = [] } = useFavoriteNotePages();

  // Only grow the window once the current page has fully loaded, so a visible
  // sentinel can't rapidly over-request while a fetch is still in flight.
  const recentHasMore = recentPages.length >= recentLimit;
  const loadMoreRecent = useCallback(() => {
    setRecentLimit((current) => (recentPages.length >= current ? current + RECENT_PAGE_SIZE : current));
  }, [recentPages.length]);

  const {
    canCreatePageFromSearch,
    favoritePages,
    filteredSearchPages,
    normalizedPages,
    normalizedSearchQuery,
    notePageIdByTitle,
    notePageTitles,
    notePageEmojiByTitle,
    recentAccessPages,
    tagDirectory,
  } = useNotesPageDerivedState({
    allPages,
    recentPages,
    favoritePageRows,
    pageSearchQuery,
  });

  // ─── Tag directory open state reconciliation ─────────────────────────────
  useEffect(() => {
    setTagDirectoryOpen((current) => {
      const next: Record<string, boolean> = {};
      let hasChanged = Object.keys(current).length !== tagDirectory.length;

      tagDirectory.forEach((entry, index) => {
        const nextValue = current[entry.key] ?? (index === 0);
        next[entry.key] = nextValue;
        if (current[entry.key] !== nextValue) {
          hasChanged = true;
        }
      });

      return hasChanged ? next : current;
    });
  }, [tagDirectory, setTagDirectoryOpen]);

  const isLoading = isLoadingCounts || isLoadingRecentPages;

  // Local toggle for absolute/relative updated time display in top bar
  const [showAbsoluteUpdatedTime, setShowAbsoluteUpdatedTime] = useState(false);
  // Reset the toggle when navigating to a different page (adjust-state-during-render
  // pattern — avoids a setState-in-effect cascade).
  const [prevTimestampPageId, setPrevTimestampPageId] = useState(selectedPageId);
  if (selectedPageId !== prevTimestampPageId) {
    setPrevTimestampPageId(selectedPageId);
    setShowAbsoluteUpdatedTime(false);
  }
  const absoluteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealAbsoluteUpdatedTime = useCallback(() => {
    setShowAbsoluteUpdatedTime((prev) => {
      if (prev) {
        if (absoluteTimerRef.current) clearTimeout(absoluteTimerRef.current);
        absoluteTimerRef.current = null;
        return false;
      }
      absoluteTimerRef.current = setTimeout(() => {
        setShowAbsoluteUpdatedTime(false);
        absoluteTimerRef.current = null;
      }, 5000);
      return true;
    });
  }, []);

  // ─── Surface state (overview vs editor) ──────────────────────────────────
  const {
    editorUpdatedTimestamp,
    isDisplayingOverview,
    overviewFavoritePagesToRender,
    overviewRecentPagesToRender,
    showOverviewLoading,
    showSelectedPageLoading,
    transitionToEditor,
    transitionToOverview,
  } = useNotesSurfaceState({
    selectedPageId,
    isLoading,
    isLoadingSelectedPage: !shellHandle?.isReady && Boolean(selectedPageId),
    favoritePages,
    recentAccessPages,
    selectedPageIdForEditor: selectedPageId,
    updatedTimestamp: shellHandle?.stableUpdatedTimestamp ?? null,
  });

  // ─── Details section open state ──────────────────────────────────────────
  useEffect(() => {
    if (!shellHandle?.isReady) return;

    const nextState = {
      outline: true,
      summary: true,
      references: true,
      attachments: true,
      timeline: true,
    };

    setDetailsSectionOpen((current) => {
      if (
        current.outline === nextState.outline &&
        current.summary === nextState.summary &&
        current.references === nextState.references &&
        current.attachments === nextState.attachments &&
        current.timeline === nextState.timeline
      ) {
        return current;
      }

      return nextState;
    });
  }, [shellHandle?.isReady, selectedPageId, setDetailsSectionOpen]);

  // ─── Navigation ─────────────────────────────────────────────────────────
  const {
    currentPageTitle,
    appNavigationRef,
    openPageById,
    goBack,
    navigateBreadcrumb,
    navigateFromPeek,
  } = useNotesNavigation({
    selectedPageId,
    navStack,
    allPages,
    transitionToEditor,
    transitionToOverview,
    onCloseMobileDrawers: () => {
      (document.activeElement as HTMLElement)?.blur?.();
      setIsMobilePagesDrawerOpen(false);
      setIsMobileDetailsDrawerOpen(false);
    },
    shellPageTitleDraft: shellHandle?.pageTitleDraft,
  });

  const handleCreateStarterPage = async () => {
    setPageSearchQuery("");
    setIsPageSearchOpen(true);
  };

  // Command-palette "New note" (/notes?new=1) opens the create-page search.
  useNewItemParam(handleCreateStarterPage, true);

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

  // ─── Page peek ───────────────────────────────────────────────────────────
  const { peekTarget, openPeek, closePeek } = usePagePeek();

  const handlePeekPageReference = useCallback((title: string, rect: DOMRect) => {
    openPeek({ pageTitle: title, anchorRect: rect });
  }, [openPeek]);

  const handlePeekNavigate = useCallback((title: string) => {
    closePeek();
    const targetPageId = notePageIdByTitle.get(title.trim().toLocaleLowerCase());
    if (targetPageId) {
      navigateFromPeek(title, targetPageId);
    }
  }, [closePeek, notePageIdByTitle, navigateFromPeek]);

  // ─── Overview actions ────────────────────────────────────────────────────
  const togglePageFavorite = useCallback((page: NormalizedNotePage) => {
    const pageProperties = parseProperties(page.properties);
    updateNotePageProperties(page.id, {
      ...(pageProperties as Record<string, unknown>),
      favorite: pageProperties.favorite !== true,
    });
  }, []);

  // ─── Search popup close delay ────────────────────────────────────────────
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

  // ─── Desktop chrome variables ─────────────────────────────────────────────
  const showDesktopUpdatedTimestamp = Boolean(editorUpdatedTimestamp && !isLoading && !showSelectedPageLoading && shellHandle?.isReady);
  const showMobileUpdatedTimestamp = Boolean(editorUpdatedTimestamp);
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
      onSelectPage={(pageId) => openPageById(pageId)}
    />
  );

  const detailsRail = shellHandle?.isReady ? (
    <NotesDetailsRail
      selectedPage={shellHandle.page}
      detailsSectionOpen={detailsSectionOpen}
      pageOutline={shellHandle.pageOutline}
      summaryDraft={summaryDraft}
      selectedTagIdsDraft={shellHandle.selectedTagIdsDraft}
      linkedReferences={shellHandle.linkedReferences}
      selectedPageAttachments={shellHandle.attachments}
      createdTimestamp={shellHandle.createdTimestamp}
      isLoadingLinkedReferences={shellHandle.isLoadingLinkedReferences}
      isLoadingAttachments={shellHandle.isLoadingAttachments}
      onToggleDetailsSection={toggleDetailsSection}
      onSetSummaryDraft={(value) => {
        setSummaryDraft(value);
        shellHandle.setSummaryDraft(value);
      }}
      onPersistSelectedPageProperties={shellHandle.persistSelectedPageProperties}
      onSetFocusTarget={shellHandle.setFocusTarget}
      onNavigateToPage={openPageById}
    />
  ) : null;

  // Keep the last-ready details rail visible through a navigation gap (the shell
  // briefly unmounts on a page switch), so switching notes doesn't flash the
  // skeleton — the same "stay put" behaviour the pages rail has. Snapshot it
  // during render (keyed by page, so it captures once per page, not every
  // render); the skeleton then only shows on the very first load.
  const [stickyDetails, setStickyDetails] = useState<{ id: string | null; node: ReactNode }>({ id: null, node: null });
  if (detailsRail && stickyDetails.id !== selectedPageId) {
    setStickyDetails({ id: selectedPageId, node: detailsRail });
  }
  const detailsRailContent = detailsRail ?? stickyDetails.node;

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

  const isFavorite = shellHandle?.selectedPageProperties?.favorite === true;

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background"
      onTouchStart={handleMobileEdgeSwipeStart}
      onTouchEnd={handleMobileEdgeSwipeEnd}
    >
      {!graphView && (isDisplayingOverview || showEditorAppHeader) ? (
        <AppHeader
          app={notesApp}
          mobileMenuItems={isDisplayingOverview ? (
            <>
              <DropdownMenuItem onClick={() => setIsManageTagsOpen(true)}>
                <span>Manage Tags</span>
                <TagIcon className="ml-auto h-4 w-4 text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsManagePropertiesOpen(true)}>
                <span>Manage Properties</span>
                <Columns3 className="ml-auto h-4 w-4 text-muted-foreground" />
              </DropdownMenuItem>
            </>
          ) : undefined}
          actions={isDisplayingOverview ? (
            <>
              <ManageTagsDialog />
              <ManageTagsDialog open={isManageTagsOpen} onOpenChange={setIsManageTagsOpen} hideTrigger />
              <ManagePropertiesDialog />
              <ManagePropertiesDialog open={isManagePropertiesOpen} onOpenChange={setIsManagePropertiesOpen} hideTrigger />
              <button
                type="button"
                onClick={() => startTransition(() => { router.push("/notes/graph"); })}
                className={HEADER_ACTION_NEUTRAL}
              >
                <Network className="h-4 w-4" />
                <span className="hidden sm:inline">Graph</span>
              </button>
              <button
                type="button"
                onClick={handleCreateStarterPage}
                disabled={isCreatingPage}
                className={cn(HEADER_ACTION_BASE, notesApp.accent.hoverText, "disabled:pointer-events-none disabled:opacity-50")}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{isCreatingPage ? "Creating…" : "New page"}</span>
              </button>
            </>
          ) : undefined}
        />
      ) : null}

      <main className={cn(
        "flex-1 overflow-x-hidden px-[var(--app-gutter-x)]",
        graphView
          ? "overflow-hidden py-3 sm:py-4 md:py-6"
          : isDisplayingOverview
          ? "overflow-y-auto pb-[var(--mobile-bottom-fab-clearance)] pt-0 sm:overflow-y-auto sm:pb-4 md:pt-0 md:pb-8"
          : "overflow-y-auto py-4 pb-[var(--mobile-bottom-fab-clearance)] sm:overflow-hidden sm:pb-4 md:py-8 md:pb-8",
      )}>
        {graphView ? (
          <div className="mx-auto h-full min-h-0 max-w-[1600px]">
            <NotesGraphView onOpenPage={(pageId) => openPageById(pageId)} onExit={() => startTransition(() => { router.push("/notes"); })} />
          </div>
        ) : (
        <div className="mx-auto max-w-[1600px] space-y-4 sm:flex sm:h-full sm:min-h-0 sm:flex-col sm:space-y-0">
          {isDisplayingOverview ? (
            <NotesOverview
              isPageSearchOpen={isPageSearchOpen}
              overviewSearchTriggerRef={overviewSearchTriggerRef}
              overviewFavoritePagesToRender={overviewFavoritePagesToRender}
              overviewRecentPagesToRender={overviewRecentPagesToRender}
              showOverviewLoading={showOverviewLoading}
              recentHasMore={recentHasMore}
              onLoadMoreRecent={loadMoreRecent}
              onOpenSearch={() => setIsPageSearchOpen(true)}
              onOpenGraph={() => startTransition(() => { router.push("/notes/graph"); })}
              onSelectPage={(pageId) => openPageById(pageId)}
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

                {detailsRailContent || showSelectedPageLoading ? (
                  <MobileRailDrawer
                    direction="right"
                    triggerIcon={Files}
                    triggerLabel="Details"
                    title="Details"
                    description="Outline, references, summary, and attachments for the current page."
                    open={isMobileDetailsDrawerOpen}
                    onOpenChange={setIsMobileDetailsDrawerOpen}
                  >
                    {detailsRailContent ?? <NotesDetailsRailSkeleton />}
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

                <NotesEditorChromeBar
                  showTimestamp={showDesktopUpdatedTimestamp}
                  showAbsoluteTime={showAbsoluteUpdatedTime}
                  timestamp={editorUpdatedTimestamp}
                  isFavorite={isFavorite}
                  showAppHeader={showEditorAppHeader}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  pageId={selectedPageId ?? ""}
                  onBack={goBack}
                  onToggleTimestamp={revealAbsoluteUpdatedTime}
                  onToggleAppHeader={() => setShowEditorAppHeader((current) => !current)}
                  onToggleFavorite={() => shellHandle?.handleToggleFavorite()}
                  onCopyDocument={() => { void shellHandle?.handleCopyDocument(); }}
                  onUndo={() => { void shellHandle?.undo(); }}
                  onRedo={() => { void shellHandle?.redo(); }}
                  onDelete={() => {
                    setIsMobileDetailsDrawerOpen(false);
                    setIsDeleteDialogOpen(true);
                  }}
                />

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
                  <aside className="hidden sm:block sm:h-full sm:min-h-0 sm:overflow-hidden">{navigationRail}</aside>
                ) : <div className="hidden sm:block" aria-hidden="true" />}

                <section className="min-w-0 sm:h-full sm:min-h-0 sm:overflow-y-auto">
                  {navStack.stack.length > 0 && !isDisplayingOverview && (
                    <div className="mx-auto hidden max-w-3xl px-3 pt-1 sm:block sm:px-0">
                      <NotesPageBreadcrumb
                        stack={navStack.stack}
                        currentTitle={currentPageTitle}
                        onNavigate={navigateBreadcrumb}
                      />
                    </div>
                  )}
                  {selectedPageId && (
                    <NotePageShell
                      pageId={selectedPageId}
                      notePageTitles={notePageTitles}
                      notePageEmojiByTitle={notePageEmojiByTitle}
                      notePageIdByTitle={notePageIdByTitle}
                      onNavigateToPage={openPageById}
                      onDeleteSuccess={() => {
                        appNavigationRef.current = true;
                        transitionToOverview();
                        startTransition(() => {
                          router.push("/notes");
                        });
                      }}
                      onPeekPageReference={handlePeekPageReference}
                      onStateChange={setShellHandle}
                      onUndoStateChange={handleUndoStateChange}
                      onSummaryDraftChange={setSummaryDraft}
                    />
                  )}
                </section>

                {showDesktopDetailsRail ? (
                  <aside className="hidden sm:flex sm:h-full sm:min-h-0 sm:overflow-hidden">{detailsRailContent ?? (showSelectedPageLoading ? <NotesDetailsRailSkeleton showHeader={false} /> : null)}</aside>
                ) : <div className="hidden sm:block" aria-hidden="true" />}
              </section>
            </>
          )}
        </div>
        )}
      </main>

      <MobileBottomFabs
        app={notesApp}
        centerUseShell={isDisplayingOverview || navStack.stack.length > 0 || graphView}
        centerShellClassName={(!isDisplayingOverview && navStack.stack.length > 0) || graphView ? "max-w-[55vw] px-2.5 py-1.5" : undefined}
        centerContent={graphView ? (
          <Button
            onClick={() => startTransition(() => { router.push("/notes"); })}
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-full px-3 text-xs font-medium text-foreground"
            aria-label="Back to overview"
          >
            <ArrowLeft className="h-4 w-4" />
            Overview
          </Button>
        ) : isDisplayingOverview ? (
          <button
            type="button"
            onClick={handleCreateStarterPage}
            disabled={isCreatingPage}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground disabled:opacity-60"
            aria-label="Create new page"
          >
            <Plus className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            New page
          </button>
        ) : navStack.stack.length > 0 && !isDisplayingOverview ? (
          <NotesPageBreadcrumb
            stack={navStack.stack}
            currentTitle={currentPageTitle}
            onNavigate={navigateBreadcrumb}
          />
        ) : undefined}
        rightContent={!isDisplayingOverview ? (
          <div className="flex items-center gap-1 rounded-full border border-border bg-card/90 px-1.5 py-1 shadow-sm backdrop-blur-sm dark:bg-card/75">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => { void shellHandle?.undo(); }}
              disabled={!canUndo}
              className="size-8 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => { void shellHandle?.redo(); }}
              disabled={!canRedo}
              className="size-8 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
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
            <AlertDialogTitle>Move page to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              The page and its contents move to Trash. You can restore it from there, or delete it permanently later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={shellHandle?.isDeletingPage}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void shellHandle?.handleDeletePage(); }}
              disabled={shellHandle?.isDeletingPage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {shellHandle?.isDeletingPage ? "Moving..." : "Move to Trash"}
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
