"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@powersync/react";
import { Bookmark as BookmarkIcon, Plus, Search, X } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { CollectionHeading } from "@/components/CollectionHeading";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { BookmarkCard } from "@/components/bookmarks/BookmarkCard";
import { DashboardBookmarks } from "@/components/dashboard/DashboardBookmarks";
import { BookmarksLoadingSkeleton } from "@/components/skeletons/BookmarksLoadingSkeleton";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useNewItemParam } from "@/hooks/use-new-item-param";
import { createBookmark } from "@/lib/bookmarks/bookmarks";
import { refreshBookmarkTitle } from "@/lib/bookmarks/fetch-metadata";
import { Tag } from "@/lib/powersync/AppSchema";
import { getApp, HEADER_ACTION_BASE } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";
import { getTagColorClasses } from "@/lib/tasks/colors";
import { getLinkHost } from "@/lib/tasks/tasks";

const bookmarksApp = getApp("bookmarks");

/**
 * A single-token URL test for the omni-field: a scheme, a `www.`, or a
 * dotted host — and never anything with whitespace (that's a search phrase).
 * Keeps plain words like "react" from being mistaken for a link.
 */
function looksLikeUrl(text: string): boolean {
  if (!text || /\s/.test(text)) return false;
  return /^https?:\/\//i.test(text) || /^www\./i.test(text) || /^[^\s]+\.[a-z]{2,}([/?#]|$)/i.test(text);
}

export default function BookmarksPage() {
  const { bookmarks, isLoading } = useBookmarks();
  const { data: allTags = [] } = useQuery<Tag>("SELECT id, name, color FROM tags");
  // One field does both: type to search, paste/type a link + Enter to add.
  const [query, setQuery] = useState("");
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  // Ids of freshly-added bookmarks whose metadata fetch is still in flight.
  const [fetchingIds, setFetchingIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const trimmed = query.trim();
  const urlToAdd = looksLikeUrl(trimmed) ? trimmed : null;

  const addBookmark = async () => {
    if (!urlToAdd) return;
    setQuery("");
    const id = await createBookmark({ url: urlToAdd });
    setFetchingIds((ids) => [...ids, id]);
    void refreshBookmarkTitle(id, urlToAdd).finally(() =>
      setFetchingIds((ids) => ids.filter((x) => x !== id)),
    );
  };

  const focusInput = () => inputRef.current?.focus();

  // Command-palette "New bookmark" (?new=1) focuses the add field on arrival.
  useNewItemParam(focusInput, !isLoading);

  // Tags that are actually used, for a compact filter row.
  const usedTags = useMemo(() => {
    const used = new Set(bookmarks.flatMap((b) => b.tags));
    return allTags.filter((t) => used.has(t.id));
  }, [allTags, bookmarks]);

  const filtered = useMemo(() => {
    // A link-in-progress isn't a search term, so don't filter it away.
    const q = looksLikeUrl(query.trim()) ? "" : query.trim().toLowerCase();
    return bookmarks.filter((b) => {
      if (filterTagIds.length > 0 && !b.tags.some((t) => filterTagIds.includes(t))) return false;
      if (!q) return true;
      const host = getLinkHost(b.url) ?? "";
      return (
        b.title.toLowerCase().includes(q) ||
        b.note.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        host.toLowerCase().includes(q)
      );
    });
  }, [bookmarks, query, filterTagIds]);

  const toggleFilterTag = (id: string) =>
    setFilterTagIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const omniField = (
    <div className="mx-auto flex w-full max-w-xl items-center gap-2.5 rounded-full border border-border/65 bg-card/60 px-4 py-2.5 transition-colors focus-within:border-border">
      {urlToAdd ? (
        <Plus className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
      ) : (
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && urlToAdd) {
            e.preventDefault();
            void addBookmark();
          }
        }}
        placeholder="Search or paste a link…"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      {urlToAdd ? (
        <button
          type="button"
          onClick={() => void addBookmark()}
          className="inline-flex shrink-0 items-center rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 dark:bg-sky-500"
        >
          Add
        </button>
      ) : query ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );

  // Show the route skeleton until the first real result lands, so there's no
  // blank gap or empty-state flash between the boot skeleton and content.
  if (isLoading) return <BookmarksLoadingSkeleton />;

  return (
    <>
      <AppHeader
        app={bookmarksApp}
        actions={
          <button
            type="button"
            onClick={focusInput}
            className={cn(HEADER_ACTION_BASE, bookmarksApp.accent.hoverText)}
          >
            <Plus className="h-4 w-4" />
            New bookmark
          </button>
        }
      />

      <div className="mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="rounded-2xl bg-sky-500/10 p-3 dark:bg-sky-500/20">
              <BookmarkIcon className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="space-y-1">
              <p className="font-serif text-lg text-foreground">No bookmarks yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Save links worth returning to. One resurfaces on your dashboard each day.
              </p>
            </div>
            <div className="w-full max-w-sm">{omniField}</div>
          </div>
        ) : (
          <>
            <DashboardBookmarks variant="hero" showAllLink={false} />

            {/* Section break: the collection reads as a distinct zone from the daily hero. */}
            <CollectionHeading label="All bookmarks" count={bookmarks.length} className="mt-12 mb-6 sm:mt-16" />

            <div className="mb-8">
              {omniField}

              {usedTags.length > 0 ? (
                <div className="mx-auto mt-3 flex max-w-xl flex-wrap justify-center gap-1.5">
                  {usedTags.map((tag) => {
                    const active = filterTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleFilterTag(tag.id)}
                        className={cn(
                          "inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium transition-colors",
                          active
                            ? getTagColorClasses(tag.color || "slate")
                            : "border border-border/60 text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No bookmarks match.</p>
            ) : (
              <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
                {filtered.map((bookmark) => (
                  <div key={bookmark.id} className="mb-5 break-inside-avoid">
                    <BookmarkCard
                      bookmark={bookmark}
                      loading={fetchingIds.includes(bookmark.id)}
                      allTags={allTags}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <MobileBottomFabs
        app={bookmarksApp}
        centerContent={
          <button
            type="button"
            onClick={focusInput}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
          >
            <Plus className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            New bookmark
          </button>
        }
      />
    </>
  );
}
