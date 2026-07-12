"use client";

import type { RefObject } from "react";
import { Files, Search, Star } from "lucide-react";

import { NotesOverviewCardSkeletonItems, NotesOverviewListSkeleton } from "@/components/notes/NotesPageSkeleton";

import type { NormalizedNotePage } from "./types";
import { OverviewPageCard } from "./items";

export function NotesOverview({
  isPageSearchOpen,
  overviewSearchTriggerRef,
  overviewFavoritePagesToRender,
  overviewRecentPagesToRender,
  showOverviewOverlay,
  showOverviewLoading,
  shouldAnimateOverviewContent,
  onOpenSearch,
  onSelectPage,
  onToggleFavorite,
}: {
  isPageSearchOpen: boolean;
  overviewSearchTriggerRef: RefObject<HTMLButtonElement | null>;
  overviewFavoritePagesToRender: NormalizedNotePage[];
  overviewRecentPagesToRender: NormalizedNotePage[];
  showOverviewOverlay: boolean;
  showOverviewLoading: boolean;
  shouldAnimateOverviewContent: boolean;
  onOpenSearch: () => void;
  onSelectPage: (pageId: string) => void;
  onToggleFavorite: (page: NormalizedNotePage) => void;
}) {
  return (
    <section className="space-y-6 animate-fade-slide-in pt-0">
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-4 pb-4 md:-mx-6 md:px-6 md:pt-5">
        <div className="pointer-events-none absolute inset-0 border-b border-border/40 bg-background" />
        <div
          className="pointer-events-none absolute inset-x-0 -bottom-6 h-10"
          style={{
            background: "linear-gradient(to bottom, var(--background) 0%, color-mix(in oklch, var(--background) 94%, transparent) 38%, transparent 100%)",
          }}
        />
        <div className="relative flex justify-center">
          <button
            ref={overviewSearchTriggerRef}
            type="button"
            onClick={onOpenSearch}
            className="flex h-10 w-full max-w-xl items-center gap-3 rounded-full border border-border/70 bg-card/95 px-4 text-left text-sm text-muted-foreground shadow-[0_10px_30px_-24px_rgba(15,23,42,0.6)] transition-colors hover:border-border hover:text-foreground"
            aria-label="Search pages"
            aria-expanded={isPageSearchOpen}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Search or create pages</span>
            <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">Search</span>
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <p className="font-heading text-sm font-semibold text-foreground">Favorites</p>
            </div>
          </div>

          <div className="relative mt-4 min-h-24">
            <div className={showOverviewOverlay ? "pointer-events-none opacity-0 transition-opacity duration-100" : "transition-opacity duration-150"}>
              <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${shouldAnimateOverviewContent ? "animate-stagger" : ""}`}>
                {overviewFavoritePagesToRender.length === 0 ? (
                  showOverviewLoading ? <NotesOverviewCardSkeletonItems /> : <div className="col-span-2 py-6 font-serif text-sm text-muted-foreground">No favorites yet.</div>
                ) : (
                  overviewFavoritePagesToRender.map((page) => (
                    <OverviewPageCard
                      key={page.id}
                      page={page}
                      onSelectPage={onSelectPage}
                      onToggleFavorite={onToggleFavorite}
                      showTags={true}
                      showUpdated={true}
                    />
                  ))
                )}
              </div>
            </div>
            {showOverviewOverlay ? (
              <div className="pointer-events-none absolute inset-0 bg-background">
                <div className="grid grid-cols-2 gap-3 animate-stagger sm:gap-4">
                  <NotesOverviewCardSkeletonItems />
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2">
            <Files className="h-4 w-4 text-muted-foreground" />
            <p className="font-heading text-sm font-semibold text-foreground">Recently accessed</p>
          </div>

          <div className="relative mt-4 min-h-24">
            <div className={showOverviewOverlay ? "pointer-events-none opacity-0 transition-opacity duration-100" : "transition-opacity duration-150"}>
              <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${shouldAnimateOverviewContent ? "animate-stagger" : ""}`}>
                {overviewRecentPagesToRender.length === 0 ? (
                  showOverviewLoading ? <NotesOverviewCardSkeletonItems /> : <div className="col-span-2 py-6 font-serif text-sm text-muted-foreground">No recent pages yet.</div>
                ) : (
                  overviewRecentPagesToRender.map((page) => (
                    <OverviewPageCard
                      key={page.id}
                      page={page}
                      onSelectPage={onSelectPage}
                      onToggleFavorite={onToggleFavorite}
                      showTags={true}
                      showUpdated={true}
                    />
                  ))
                )}
              </div>
            </div>
            {showOverviewOverlay ? (
              <div className="pointer-events-none absolute inset-0 bg-background">
                <div className="grid grid-cols-2 gap-3 animate-stagger sm:gap-4">
                  <NotesOverviewCardSkeletonItems />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}