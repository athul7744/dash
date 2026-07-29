"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Desktop-only WeekNavigator row: prev/next arrows + week & year selects + range.
 * Lives outside `WeekViewSkeleton` because the in-page week view already renders
 * the real `WeekNavigator` above the body — only the cold-boot skeleton
 * (TrackerLoadingSkeleton), which has no real nav, needs this placeholder.
 */
export function WeekNavigatorSkeleton() {
  return (
    <div className="hidden sm:flex items-center gap-2 flex-wrap">
      <Skeleton className="h-8 w-8 rounded-md" />
      <Skeleton className="h-8 w-16 rounded-md" />
      <Skeleton className="h-8 w-20 rounded-md" />
      <Skeleton className="h-8 w-8 rounded-md" />
      <Skeleton className="ml-2 h-3 w-32 rounded-full" />
    </div>
  );
}

/** Skeleton for the ActivityToolbar row (eraser + activity pills). */
function ToolbarSkeleton() {
  return (
    <div className="flex items-start gap-2 overflow-hidden">
      <Skeleton className="mt-1 h-7 w-7 shrink-0 rounded-full" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 shrink-0 rounded-full" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the TimeGrid table. */
function TimeGridSkeleton() {
  return (
    <div className="rounded-lg border border-border">
      <div className="overflow-x-auto overscroll-y-none [touch-action:pan-x_pan-y]">
        <table className="border-separate border-spacing-0 w-max min-w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-muted px-1 py-2 w-[52px] border-r border-b border-border">
                <Skeleton className="h-3 w-8 mx-auto" />
              </th>
              <th className="sticky left-[52px] z-10 bg-muted px-3 py-2 min-w-[90px] border-r border-b border-border">
                <Skeleton className="h-3 w-10" />
              </th>
              {Array.from({ length: 24 }).map((_, h) => (
                <th key={h} className="px-1 py-2 text-center font-medium text-muted-foreground min-w-[44px] border-l border-border">
                  {String(h).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }).map((_, row) => (
              <tr key={row} className="border-t border-border">
                <td className="sticky left-0 z-10 bg-muted px-1 py-1 border-r border-border w-[52px]">
                  <Skeleton className="h-4 w-4 rounded-full mx-auto" />
                </td>
                <td className="sticky left-[52px] z-10 bg-muted px-3 py-2 border-r border-border">
                  <Skeleton className="h-3 w-16" />
                </td>
                {Array.from({ length: 24 }).map((_, h) => (
                  <td key={h} className="border-l border-border h-9 w-11">
                    {/* randomly fill ~20% of cells */}
                    {((row * 24 + h) * 7 + row) % 5 === 0 && (
                      <Skeleton className="h-full w-full rounded-none" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Skeleton for the widgets section */
function WidgetsSkeleton() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Row 1: two small cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="grid grid-cols-7 gap-1 items-end h-12">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="rounded-sm" style={{ height: `${20 + ((i * 17) % 80)}%` }} />
            ))}
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
        <div className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex justify-center gap-2 py-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-6 rounded-full" />
            ))}
          </div>
          <div className="flex justify-center">
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>

      {/* Row 2: two medium cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="flex justify-center py-2">
            <Skeleton className="h-52 w-52 rounded-full sm:h-60 sm:w-60" />
          </div>
        </div>
        <div className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="grid grid-cols-7 gap-1 items-end h-36">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="rounded-sm" style={{ height: `${30 + ((i * 23) % 70)}%` }} />
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: full-width card */}
      <div className="border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3.5 w-3.5 rounded" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-7 w-full rounded-full" />
        <div className="flex gap-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

/** Placeholder for the week journal diary below the widgets (mirrors WeekJournalDiary). */
function WeeklyJournalSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border/65 bg-gradient-to-b from-card/70 to-card/40 p-4 shadow-[0_12px_38px_-28px_rgba(0,0,0,0.45)]">
      {/* Widget header: icon + title + range */}
      <div className="mb-3 flex items-center gap-1.5">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3.5 w-16 rounded-full" />
        <Skeleton className="h-3 w-20 rounded-full" />
      </div>
      {/* A couple of day rows: left date block + entry lines */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className={`grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-5 py-3 ${i > 0 ? "border-t border-border/40" : ""}`}>
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-6" />
            <Skeleton className="h-5 w-5" />
          </div>
          <div className="space-y-2 pt-1">
            <Skeleton className="h-3.5 w-11/12 rounded-full" />
            <Skeleton className="h-3.5 w-2/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeekViewSkeleton() {
  return (
    <>
      <section>
        <ToolbarSkeleton />
      </section>
      <section>
        <TimeGridSkeleton />
      </section>
      <section className="mt-4">
        <WidgetsSkeleton />
      </section>
      <section className="mt-8">
        <WeeklyJournalSkeleton />
      </section>
    </>
  );
}
