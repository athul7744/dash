"use client";

import { ChevronDown, Clock3, Hash, PanelLeftClose, Star, Tags } from "lucide-react";

import { NotesNavigationRailSkeleton } from "@/components/notes/NotesPageSkeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { getTagDotClass } from "@/lib/tasks/colors";

import { DetailsSection } from "./ui";
import type { NormalizedNotePage, TagDirectoryEntry } from "./types";
import { NavigationPageLink } from "./items";

type PageRailSectionState = {
  favorites: boolean;
  recent: boolean;
  tags: boolean;
};

export function NotesNavigationRailHeader({
  areAllSectionsOpen,
  showDesktopPagesRail,
  onToggleAllSections,
  onHideDesktopPagesRail,
}: {
  areAllSectionsOpen: boolean;
  showDesktopPagesRail: boolean;
  onToggleAllSections: () => void;
  onHideDesktopPagesRail: () => void;
}) {
  if (!showDesktopPagesRail) {
    return null;
  }

  return (
    <div className="hidden h-9 w-full items-center justify-between gap-3 sm:flex">
      <p className="text-sm font-semibold text-foreground">Pages</p>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleAllSections}
          className="h-8 rounded-full px-3 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {areAllSectionsOpen ? "Collapse all" : "Expand all"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onHideDesktopPagesRail}
          className="size-8 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Hide pages panel"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function NotesNavigationRail({
  isLoading,
  normalizedPages,
  favoritePages,
  recentAccessPages,
  tagDirectory,
  tagDirectoryOpen,
  pageRailSectionOpen,
  selectedPageId,
  areAllSectionsOpen,
  onToggleAllSections,
  onTogglePageRailSection,
  onToggleTagDirectoryGroup,
  onSelectPage,
}: {
  isLoading: boolean;
  normalizedPages: NormalizedNotePage[];
  favoritePages: NormalizedNotePage[];
  recentAccessPages: NormalizedNotePage[];
  tagDirectory: TagDirectoryEntry[];
  tagDirectoryOpen: Record<string, boolean>;
  pageRailSectionOpen: PageRailSectionState;
  selectedPageId: string | null;
  areAllSectionsOpen: boolean;
  onToggleAllSections: () => void;
  onTogglePageRailSection: (section: keyof PageRailSectionState) => void;
  onToggleTagDirectoryGroup: (key: string) => void;
  onSelectPage: (pageId: string) => void;
}) {
  return (
    <div className="animate-fade-slide-in w-full space-y-3 py-1 sm:flex sm:w-full sm:min-w-0 sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:flex-col sm:gap-3 sm:space-y-0 sm:overflow-hidden">
      <div className="min-w-0 w-full space-y-3 pr-1 pb-4 transition-smooth sm:min-h-0 sm:w-0 sm:min-w-full sm:flex-1 sm:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <p className="text-sm font-semibold text-foreground">Pages</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleAllSections}
            className="h-8 rounded-full px-3 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {areAllSectionsOpen ? "Collapse all" : "Expand all"}
          </Button>
        </div>

        {isLoading ? (
          <div className="px-1 py-1">
            <NotesNavigationRailSkeleton showHeader={false} />
          </div>
        ) : normalizedPages.length === 0 ? (
          <div className="px-2 py-4 text-[13px] text-muted-foreground">No pages yet. Create one to start writing.</div>
        ) : (
          <div className="divide-y divide-border/20">
            <div className="pb-3">
              <DetailsSection
                title="Favorites"
                icon={Star}
                accentClassName="text-amber-600 dark:text-amber-400"
                isOpen={pageRailSectionOpen.favorites}
                onToggle={() => onTogglePageRailSection("favorites")}
              >
                <div className="space-y-0.5">
                  {favoritePages.length === 0 ? (
                    <div className="px-2 py-1 text-[12px] text-muted-foreground">No favorites yet.</div>
                  ) : (
                    favoritePages.map((page) => (
                      <NavigationPageLink
                        key={page.id}
                        page={page}
                        selectedPageId={selectedPageId}
                        onSelectPage={onSelectPage}
                        showTags={false}
                        trailing={<Star className="mt-0.5 h-4 w-4 shrink-0 fill-current text-amber-500" />}
                      />
                    ))
                  )}
                </div>
              </DetailsSection>
            </div>

            <div className="py-3">
              <DetailsSection
                title="Recently accessed"
                icon={Clock3}
                accentClassName="text-sky-600 dark:text-sky-400"
                isOpen={pageRailSectionOpen.recent}
                onToggle={() => onTogglePageRailSection("recent")}
              >
                <div className="space-y-0.5">
                  {recentAccessPages.length === 0 ? (
                    <div className="px-2 py-1 text-[12px] text-muted-foreground">No recent pages yet.</div>
                  ) : (
                    recentAccessPages.map((page) => (
                      <NavigationPageLink
                        key={page.id}
                        page={page}
                        selectedPageId={selectedPageId}
                        onSelectPage={onSelectPage}
                        showTags={false}
                      />
                    ))
                  )}
                </div>
              </DetailsSection>
            </div>

            <div className="pt-3">
              <DetailsSection
                title="Tags"
                icon={Tags}
                accentClassName="text-emerald-600 dark:text-emerald-400"
                isOpen={pageRailSectionOpen.tags}
                onToggle={() => onTogglePageRailSection("tags")}
              >
              <div className="space-y-0.5">
                {tagDirectory.length === 0 ? (
                  <div className="px-2 py-1 text-[12px] text-muted-foreground">No tags yet.</div>
                ) : (
                  tagDirectory.map((entry) => {
                    const isOpen = tagDirectoryOpen[entry.key] ?? false;

                    return (
                      <div key={entry.key} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => onToggleTagDirectoryGroup(entry.key)}
                          aria-expanded={isOpen}
                          aria-controls={`tag-directory-${entry.key}`}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", getTagDotClass(entry.color || "slate"))} />
                            <span className="truncate text-[12px] font-medium text-foreground">#{entry.label}</span>
                            <span className="text-[11px] text-muted-foreground/70">{entry.count}</span>
                          </span>
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`} />
                        </button>

                        <div
                          id={`tag-directory-${entry.key}`}
                          className={`grid overflow-hidden transition-all duration-180 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                        >
                          <div className="min-h-0" inert={!isOpen}>
                            <div className={`space-y-0.5 pl-4 transition-all duration-180 ease-out ${isOpen ? "translate-y-0 opacity-100" : "-translate-y-0.5 opacity-0"}`} aria-hidden={!isOpen}>
                              {entry.pages.map((page) => (
                                <NavigationPageLink
                                  key={page.id}
                                  page={page}
                                  selectedPageId={selectedPageId}
                                  onSelectPage={onSelectPage}
                                  showTags={false}
                                  className="px-1 py-1.5"
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              </DetailsSection>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}