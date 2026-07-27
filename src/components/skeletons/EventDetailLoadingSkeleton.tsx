"use client";

import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { getApp } from "@/lib/shared/apps";

const eventsApp = getApp("events");

/**
 * Full-page skeleton for the event detail view. Used by the `[id]/loading.tsx`
 * navigation fallback and while the single-event query settles. Mirrors the
 * detail layout: back-link, hero, schedule strip, stat tiles, heatmap card,
 * and the log.
 */
export function EventDetailLoadingSkeleton() {
  return (
    <>
      <AppHeader app={eventsApp} />
      <div className="mx-auto max-w-2xl px-[var(--app-gutter-x)] py-8 pb-40 lg:max-w-7xl">
        {/* back-link */}
        <div className="mb-5 flex items-center gap-1.5">
          <Skeleton className="h-4 w-4 rounded-sm" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-8">
          {/* left: overview */}
          <div className="min-w-0">
            {/* hero */}
            <div className="min-w-0 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-3/5" />
              <Skeleton className="h-4 w-40" />
            </div>

            {/* schedule strip */}
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-border/65 bg-card/50 p-4">
              <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-7 w-28 shrink-0 rounded-full" />
            </div>

            {/* stats */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border/65 bg-card/50 p-3.5">
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="mt-2 h-5 w-16" />
                </div>
              ))}
            </div>

            {/* heatmap */}
            <div className="mt-6 rounded-xl border border-border/65 bg-card/50 p-4">
              <div className="flex items-baseline justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="mt-3 h-24 w-full" />
            </div>
          </div>

          {/* right: log */}
          <div className="mt-8 min-w-0 lg:mt-0">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-40 rounded-full" />
            </div>
            <div className="overflow-hidden rounded-xl border border-border/65">
              <Skeleton className="h-6 w-full rounded-none" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5 last:border-b-0">
                  <Skeleton className="h-4 w-24 shrink-0" />
                  <Skeleton className="h-3 w-16 shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
