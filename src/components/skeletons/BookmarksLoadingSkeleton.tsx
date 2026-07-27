"use client";

import { AppHeader } from "@/components/AppHeader";
import { Skeleton, SkeletonWave } from "@/components/ui/skeleton";
import { getApp } from "@/lib/shared/apps";

const bookmarksApp = getApp("bookmarks");

function BookmarkCardBone({ withNote = true }: { withNote?: boolean }) {
  return (
    <div className="mb-5 break-inside-avoid rounded-2xl border border-border/65 bg-card/60 p-5 sm:p-6">
      {/* Header: favicon tile (left) + action buttons (right). */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
          <Skeleton className="h-5 w-5 rounded-sm" />
        </div>
        <div className="flex items-center gap-0.5">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-40" />
        {withNote ? <Skeleton className="mt-2 h-4 w-full" /> : null}
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-14 rounded-sm" />
          <Skeleton className="h-5 w-16 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

/**
 * Full-page bookmarks skeleton. Shared by the route `loading.tsx` (navigation
 * fallback) and the cold-start boot skeleton so both look identical. Mirrors
 * the /bookmarks page: sticky header, a "revisit" band, an add/search/filter
 * toolbar, then a card list.
 */
export function BookmarksLoadingSkeleton() {
  return (
    <>
      <AppHeader app={bookmarksApp} />
      <div className="mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        {/* Centered daily hero */}
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-4 sm:py-7">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-7 w-3/5" />
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Section break */}
        <div className="mt-12 mb-6 flex items-baseline gap-3 sm:mt-16">
          <Skeleton className="h-3 w-24" />
          <div className="h-px flex-1 bg-border/40" />
        </div>

        {/* Toolbar: centered omni-field + centered tag row */}
        <div className="mb-8">
          <Skeleton className="mx-auto h-10 w-full max-w-xl rounded-full" />
          <div className="mx-auto mt-3 flex max-w-xl flex-wrap justify-center gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </div>

        <SkeletonWave className="columns-1 gap-5 md:columns-2 lg:columns-3">
          <BookmarkCardBone />
          <BookmarkCardBone withNote={false} />
          <BookmarkCardBone />
          <BookmarkCardBone withNote={false} />
          <BookmarkCardBone />
          <BookmarkCardBone />
        </SkeletonWave>
      </div>
    </>
  );
}
