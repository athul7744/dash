"use client";

import { useState, type RefObject } from "react";
import { Files, LayoutGrid, Network, Rows3, Search, Star, Waypoints, type LucideIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { FadeIn } from "@/components/motion/FadeIn";
import { useNotesOverviewView } from "@/hooks/use-notes-overview-view";
import { OVERVIEW_VIEWS, type OverviewView } from "@/lib/notes/overview-view";
import { cn } from "@/lib/shared/utils";

import type { NormalizedNotePage } from "./types";
import {
  EmptyState,
  FavoritesList,
  InfiniteSentinel,
  OverviewSkeleton,
  RecentList,
  Section,
  ShowMoreButton,
} from "./overview-views";

/** Favorites are capped in the view and revealed 10 at a time via "Show more". */
const FAVORITES_PAGE_SIZE = 10;

const VIEW_ICONS: Record<OverviewView, LucideIcon> = {
  rows: Rows3,
  gallery: LayoutGrid,
  spine: Waypoints,
};

function ViewSwitcher({ view, onChange }: { view: OverviewView; onChange: (view: OverviewView) => void }) {
  return (
    <div
      role="group"
      aria-label="Overview layout"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-card/95 p-0.5 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.6)]"
    >
      {OVERVIEW_VIEWS.map(({ value, label }) => {
        const Icon = VIEW_ICONS[value];
        const active = value === view;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            title={label}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-smooth",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NotesOverview({
  isPageSearchOpen,
  overviewSearchTriggerRef,
  overviewFavoritePagesToRender,
  overviewRecentPagesToRender,
  showOverviewLoading,
  recentHasMore,
  onLoadMoreRecent,
  onOpenSearch,
  onOpenGraph,
  onSelectPage,
  onToggleFavorite,
}: {
  isPageSearchOpen: boolean;
  overviewSearchTriggerRef: RefObject<HTMLButtonElement | null>;
  overviewFavoritePagesToRender: NormalizedNotePage[];
  overviewRecentPagesToRender: NormalizedNotePage[];
  showOverviewLoading: boolean;
  recentHasMore: boolean;
  onLoadMoreRecent: () => void;
  onOpenSearch: () => void;
  onOpenGraph: () => void;
  onSelectPage: (pageId: string) => void;
  onToggleFavorite: (page: NormalizedNotePage) => void;
}) {
  const { view, setView } = useNotesOverviewView();
  const [favoritesShown, setFavoritesShown] = useState(FAVORITES_PAGE_SIZE);
  const [collapsed, setCollapsed] = useState({ favorites: false, recent: false });

  const favorites = overviewFavoritePagesToRender;
  const recent = overviewRecentPagesToRender;
  const visibleFavorites = favorites.slice(0, favoritesShown);
  const favoritesHasMore = favorites.length > visibleFavorites.length;

  const toggleCollapsed = (key: "favorites" | "recent") =>
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));

  const listProps = { onSelectPage, onToggleFavorite };

  return (
    <section className="space-y-6 pt-0">
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-4 pb-4 md:-mx-6 md:px-6 md:pt-5">
        <div className="pointer-events-none absolute inset-0 border-b border-border/40 bg-background" />
        <div
          className="pointer-events-none absolute inset-x-0 -bottom-6 h-10"
          style={{
            background: "linear-gradient(to bottom, var(--background) 0%, color-mix(in oklch, var(--background) 94%, transparent) 38%, transparent 100%)",
          }}
        />
        <div className="relative flex items-center justify-center gap-2">
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
          {/* Graph shortcut for mobile — desktop reaches it from the app header. */}
          <button
            type="button"
            onClick={onOpenGraph}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card/95 text-muted-foreground shadow-[0_10px_30px_-24px_rgba(15,23,42,0.6)] transition-colors hover:border-border hover:text-violet-600 dark:hover:text-violet-400 sm:hidden"
            aria-label="Open graph view"
            title="Graph view"
          >
            <Network className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-10">
        <Section
          icon={Star}
          iconClass="text-amber-500"
          label="Favorites"
          count={favorites.length}
          collapsed={collapsed.favorites}
          onToggleCollapse={() => toggleCollapsed("favorites")}
          accessory={<ViewSwitcher view={view} onChange={setView} />}
          isEmpty={favorites.length === 0}
          showLoading={showOverviewLoading}
          loading={<OverviewSkeleton view={view} section="favorites" />}
          empty={<EmptyState icon={Star} label="No favorites yet." />}
        >
          <AnimatePresence mode="wait">
            <FadeIn key={view}>
              <FavoritesList view={view} pages={visibleFavorites} {...listProps} />
            </FadeIn>
          </AnimatePresence>
          {favoritesHasMore ? (
            <ShowMoreButton
              label={`Show ${Math.min(FAVORITES_PAGE_SIZE, favorites.length - visibleFavorites.length)} more`}
              onClick={() => setFavoritesShown((shown) => shown + FAVORITES_PAGE_SIZE)}
            />
          ) : null}
        </Section>

        <Section
          icon={Files}
          label="Recently accessed"
          count={recent.length}
          collapsed={collapsed.recent}
          onToggleCollapse={() => toggleCollapsed("recent")}
          isEmpty={recent.length === 0}
          showLoading={showOverviewLoading}
          loading={<OverviewSkeleton view={view} section="recent" />}
          empty={<EmptyState icon={Files} label="No recent pages yet." />}
        >
          <AnimatePresence mode="wait">
            <FadeIn key={view}>
              <RecentList view={view} pages={recent} {...listProps} />
            </FadeIn>
          </AnimatePresence>
          <InfiniteSentinel enabled={recentHasMore && !collapsed.recent} onVisible={onLoadMoreRecent} />
        </Section>
      </div>
    </section>
  );
}
