"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Columns3, Files, NotebookTabs, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Redo2, Tag as TagIcon, Undo2 } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { NotesDetailsRailSkeleton } from "@/components/notes/NotesPageSkeleton";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAllNotePages, useNoteCounts, useRecentNotePages } from "@/hooks/use-notes";
import { createStarterPage, normalizeNotePageTitle, updateNotePageProperties } from "@/lib/notes/notes";
import { flushAllNoteBlockStores } from "@/lib/notes/note-block-store";
import { getApp } from "@/lib/shared/apps";
import { flushAllUpdates, hasPendingWrites } from "@/lib/shared/debounced-update";
import { NotesDetailsRail } from "@/components/notes/page/NotesDetailsRail";
import { NotesEditorChromeBar } from "@/components/notes/page/NotesEditorChromeBar";
import { NotePageShell, type NotePageShellHandle } from "@/components/notes/page/NotePageShell";
import { NotesNavigationRail, NotesNavigationRailHeader } from "@/components/notes/page/NotesNavigationRail";
import { NotesOverview } from "@/components/notes/page/NotesOverview";
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

export default function NotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPageId = searchParams.get("page");
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

  // Shell ref for reading page-level state
  const shellRef = useRef<NotePageShellHandle>(null);

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
      flushAllNoteBlockStores();
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ─── Overview-level data ─────────────────────────────────────────────────
  const { isLoading: isLoadingCounts } = useNoteCounts();
  const { pages: allPages = [] } = useAllNotePages();
  const { pages: recentPages = [], isLoading: isLoadingRecentPages } = useRecentNotePages(8);

  const {
    canCreatePageFromSearch,
    favoritePages,
    filteredSearchPages,
    normalizedPages,
    normalizedSearchQuery,
    notePageIdByTitle,
    notePageTitles,
    recentAccessPages,
    tagDirectory,
  } = useNotesPageDerivedState({
    allPages,
    recentPages,
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
  }, [tagDirectory]);

  const isLoading = isLoadingCounts || isLoadingRecentPages;

  // Force re-render when shell becomes ready so ref-based reads are fresh
  const [, setShellTick] = useState(0);
  const handleShellReady = useCallback(() => setShellTick((n) => n + 1), []);

  // Local toggle for absolute/relative updated time display in top bar
  const [showAbsoluteUpdatedTime, setShowAbsoluteUpdatedTime] = useState(false);
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
  const shellHandle = shellRef.current;

  const {
    editorUpdatedTimestamp,
    isDisplayingOverview,
    overviewFavoritePagesToRender,
    overviewRecentPagesToRender,
    shouldAnimateOverviewContent,
    showOverviewLoading,
    showOverviewOverlay,
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
  }, [shellHandle?.isReady, selectedPageId]);

  // ─── Navigation ─────────────────────────────────────────────────────────
  const {
    editorPageTitle,
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

  // Reset absolute time display on page change
  useEffect(() => {
    setShowAbsoluteUpdatedTime(false);
  }, [selectedPageId]);

  const handleCreateStarterPage = async () => {
    setPageSearchQuery("");
    setIsPageSearchOpen(true);
  };

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
      pageTagMentions={shellHandle.pageTagMentions}
      selectedPageAttachments={shellHandle.attachments}
      createdTimestamp={shellHandle.createdTimestamp}
      isLoadingLinkedReferences={shellHandle.isLoadingLinkedReferences}
      isLoadingTagMentions={shellHandle.isLoadingTagMentions}
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
      {isDisplayingOverview || showEditorAppHeader ? (
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

      <main className={`flex-1 overflow-y-auto overflow-x-hidden px-[var(--app-gutter-x)] pb-[var(--mobile-bottom-fab-clearance)] sm:pb-4 ${isDisplayingOverview ? "sm:overflow-y-auto pt-0 md:pt-0 md:pb-8" : "sm:overflow-hidden py-4 md:py-8 md:pb-8"}`}>
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

                <NotesEditorChromeBar
                  showTimestamp={showDesktopUpdatedTimestamp}
                  showAbsoluteTime={showAbsoluteUpdatedTime}
                  timestamp={editorUpdatedTimestamp}
                  isFavorite={isFavorite}
                  showAppHeader={showEditorAppHeader}
                  canUndo={canUndo}
                  canRedo={canRedo}
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
                      ref={shellRef}
                      pageId={selectedPageId}
                      notePageTitles={notePageTitles}
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
                      onReady={handleShellReady}
                      onUndoStateChange={handleUndoStateChange}
                      onSummaryDraftChange={setSummaryDraft}
                    />
                  )}
                </section>

                {showDesktopDetailsRail ? (
                  <aside className="hidden sm:flex sm:h-full sm:min-h-0 sm:overflow-hidden">{detailsRail ?? (showSelectedPageLoading ? <NotesDetailsRailSkeleton showHeader={false} /> : null)}</aside>
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
            <AlertDialogTitle>Delete page?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the page, its blocks, attachments, and local note links. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={shellHandle?.isDeletingPage}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void shellHandle?.handleDeletePage(); }}
              disabled={shellHandle?.isDeletingPage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {shellHandle?.isDeletingPage ? "Deleting..." : "Delete page"}
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
