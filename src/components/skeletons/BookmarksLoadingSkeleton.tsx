"use client";

import { AppHeader } from "@/components/AppHeader";
import { getApp } from "@/lib/shared/apps";

const bookmarksApp = getApp("bookmarks");

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function BookmarkCardBone({ withNote = true }: { withNote?: boolean }) {
  return (
    <div className="mb-5 break-inside-avoid rounded-2xl border border-border/65 bg-card/60 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Bone className="mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
        <div className="min-w-0 flex-1 space-y-2 pr-20">
          <Bone className="h-5 w-2/3" />
          <Bone className="h-3.5 w-40" />
          {withNote ? <Bone className="mt-2 h-4 w-full" /> : null}
          <div className="flex gap-1.5 pt-1">
            <Bone className="h-5 w-14 rounded-full" />
            <Bone className="h-5 w-16 rounded-full" />
          </div>
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
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-6 sm:py-12">
          <div className="flex items-center gap-2">
            <Bone className="h-3.5 w-3.5 rounded-full" />
            <Bone className="h-3 w-20" />
          </div>
          <Bone className="h-11 w-11 rounded-xl" />
          <Bone className="h-7 w-3/5" />
          <Bone className="h-4 w-32" />
        </div>

        {/* Section break */}
        <div className="mt-12 mb-6 flex items-baseline gap-3 sm:mt-16">
          <Bone className="h-3 w-24" />
          <div className="h-px flex-1 bg-border/40" />
        </div>

        <div className="mb-6 max-w-3xl space-y-3">
          <Bone className="h-10 w-full rounded-full" />
          <Bone className="h-8 w-full" />
          <div className="flex flex-wrap gap-1.5">
            <Bone className="h-6 w-16 rounded-full" />
            <Bone className="h-6 w-20 rounded-full" />
            <Bone className="h-6 w-14 rounded-full" />
          </div>
        </div>

        <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
          <BookmarkCardBone />
          <BookmarkCardBone withNote={false} />
          <BookmarkCardBone />
          <BookmarkCardBone withNote={false} />
          <BookmarkCardBone />
          <BookmarkCardBone />
        </div>
      </div>
    </>
  );
}
