"use client";

import { AppHeader } from "@/components/AppHeader";
import { Skeleton, SkeletonWave } from "@/components/ui/skeleton";
import { dayApp } from "@/lib/shared/day-app";

/** One hour column of the day's grid — 24, at the same 44px pitch as `TimeGrid`. */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Cold-start and route skeleton for `/day/<yyyy-MM-dd>`. It borrowed Tracker's
 * week skeleton before, which is a seven-row grid and a wall of widgets —
 * nothing like this page, so the boot screen rearranged itself on settle.
 *
 * Mirrors the real order: date header, the summary card, one grid row, two of
 * the list sections, and the journal.
 *
 * It carries its own shell, as the tracker and tasks skeletons do. On a cold
 * boot this renders *instead of* the layout's `<main>` (see PowerSyncProvider),
 * so without one the grid's 24 columns widen the document itself and every
 * section stretches with it — the page ends up wider than a phone even though
 * the grid looks right. The shell clips, and the grid keeps its own scroll.
 */
export function DayLoadingSkeleton() {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <AppHeader app={dayApp} />
      <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6 overflow-x-hidden px-[var(--app-gutter-x)] py-6 pb-40">
        {/* date + day navigation */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-7 w-32 sm:w-40" />
            <Skeleton className="h-4 w-28 sm:w-32" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </div>

        {/* the day: mood, hours, activity breakdown */}
        <section className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <div className="space-y-3 rounded-2xl border border-border/60 bg-card/50 p-4">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="size-7 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-7 w-28" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className="h-3.5 min-w-0 flex-1" />
                <Skeleton className="h-3.5 w-8 shrink-0" />
              </div>
            ))}
          </div>
        </section>

        {/* hours: brush + the one-day grid */}
        <section className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-12" />
          <div className="min-w-0 space-y-3">
            <div className="flex items-start gap-2 overflow-hidden">
              <Skeleton className="mt-1 size-7 shrink-0 rounded-full" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-20 shrink-0 rounded-full" />
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="border-separate border-spacing-0 w-max min-w-full text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-30 bg-muted px-1 py-2 w-[52px] border-r border-b border-border">
                      <Skeleton className="h-3 w-8 mx-auto" />
                    </th>
                    <th className="sticky left-[52px] z-30 bg-muted px-3 py-2 w-[120px] border-r border-b border-border">
                      <Skeleton className="h-3 w-10" />
                    </th>
                    {HOURS.map((h) => (
                      <th
                        key={h}
                        className={`px-1 py-2 text-center font-medium text-muted-foreground min-w-[44px] border-b border-border ${h > 0 ? "border-l" : ""}`}
                      >
                        {String(h).padStart(2, "0")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sticky left-0 z-20 bg-muted px-1 py-1 border-r border-border w-[52px]">
                      <Skeleton className="size-4 rounded-full mx-auto" />
                    </td>
                    <td className="sticky left-[52px] z-20 bg-muted px-3 py-2 w-[120px] border-r border-border">
                      <Skeleton className="h-3 w-16" />
                    </td>
                    {HOURS.map((h) => (
                      <td key={h} className={`border-border h-9 min-w-[44px] ${h > 0 ? "border-l" : ""}`}>
                        {h % 5 === 0 && <Skeleton className="h-full w-full rounded-none" />}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* two list sections — tasks, then what was logged or kept */}
        {Array.from({ length: 2 }).map((_, section) => (
          <section key={section} className="space-y-2">
            <Skeleton className="h-3 w-14" />
            <SkeletonWave className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, row) => (
                <div
                  key={row}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2"
                >
                  <Skeleton className="size-3.5 shrink-0 rounded-sm" />
                  <Skeleton className="h-3.5 min-w-0 flex-1" />
                  <Skeleton className="h-3 w-10 shrink-0" />
                </div>
              ))}
            </SkeletonWave>
          </section>
        ))}

        {/* journal */}
        <section className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <div className="space-y-2 py-1.5">
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </section>
      </div>
    </div>
  );
}
