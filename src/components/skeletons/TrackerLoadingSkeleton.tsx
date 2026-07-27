"use client";

import { Calendar } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { WeekViewSkeleton, WeekNavigatorSkeleton } from "@/components/tracker/WeekViewSkeleton";
import { Skeleton, SkeletonAurora } from "@/components/ui/skeleton";
import { getApp } from "@/lib/shared/apps";

const trackerApp = getApp("tracker");

type TrackerView = "week" | "activity" | "mood";

/** Year-selector placeholder matching the real grids' headerLeft (icon + Select). */
function YearSelectBone() {
  return (
    <div className="flex shrink-0 items-center gap-2 pt-1">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <Skeleton className="h-8 w-20 rounded-md" />
    </div>
  );
}

/**
 * Lightweight stand-in for the Activity year heatmap (YearActivityGrid). Kept
 * dependency-free and width-independent so it stays out of the critical
 * cold-start bundle; the exact grid skeleton refines it once the page mounts.
 */
function ActivityGridSkeleton() {
  return (
    <div className="w-full space-y-3">
      <div className="flex items-start gap-3 md:gap-4">
        <YearSelectBone />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden py-1">
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-full" />
            ))}
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      <SkeletonAurora className="rounded-xl border border-border p-2">
        <div className="overflow-x-auto">
          <div className="w-max">
            {/* Hour header */}
            <div className="mb-1 flex gap-[3px] pl-[44px]">
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="w-[11px] text-center text-[9px] text-muted-foreground/50">
                  {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
                </div>
              ))}
            </div>
            {/* Day rows */}
            <div className="flex flex-col gap-[3px]">
              {Array.from({ length: 42 }).map((_, row) => (
                <div key={row} className="flex items-center gap-[3px]">
                  <div className="w-[44px] pr-1">
                    <Skeleton className="h-2.5 w-8" />
                  </div>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div
                      key={h}
                      className={`h-[11px] w-[11px] rounded-[3px] ${((row * 24 + h) * 13 + row) % 6 === 0 ? "bg-muted" : "bg-muted/30"}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SkeletonAurora>
    </div>
  );
}

/**
 * Lightweight stand-in for the Mood year grid (YearRatingGrid) — 12 month cards.
 * Mirrors the real grid's skeleton shape closely and stays dependency-free.
 */
function MoodGridSkeleton() {
  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3 md:gap-4">
        <YearSelectBone />
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <SkeletonAurora className="grid grid-cols-2 gap-4 rounded-xl p-1 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, m) => (
          <div key={m} className="rounded-xl border border-border bg-card/50 p-3">
            <Skeleton className="mx-auto mb-2 h-3.5 w-10" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={i}
                  className={`mx-auto h-4 w-4 rounded-full ${(m * 35 + i) % 5 === 0 ? "bg-muted-foreground/15" : "bg-muted/40"}`}
                />
              ))}
            </div>
          </div>
        ))}
      </SkeletonAurora>
    </div>
  );
}

/**
 * Full-page tracker skeleton. Shared by the route `loading.tsx` (navigation
 * fallback) and the cold-start boot skeleton so both look identical. `view`
 * selects the content shape so a refresh on Activity/Mood shows the matching
 * skeleton instead of the Week one.
 */
export function TrackerLoadingSkeleton({ view = "week" }: { view?: TrackerView }) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <AppHeader app={trackerApp} />

      {/* View tabs: left-aligned text tabs (icon + label), matching the real strip. */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-[var(--app-gutter-x)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5 px-3 py-2">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3.5 w-14 rounded-full" />
          </div>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-[var(--app-gutter-x)] py-4 pb-[var(--mobile-bottom-fab-clearance)] sm:pb-4 md:py-8 md:pb-8">
        <div className="space-y-4">
          {view === "activity" ? (
            <ActivityGridSkeleton />
          ) : view === "mood" ? (
            <MoodGridSkeleton />
          ) : (
            <>
              <WeekNavigatorSkeleton />
              <WeekViewSkeleton />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
