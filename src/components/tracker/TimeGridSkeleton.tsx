"use client";

import { Skeleton } from "@/components/ui/skeleton";

/** One hour column per cell, at `TimeGrid`'s own 44px pitch. */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Placeholder for `TimeGrid` — the week view's seven rows, or the Day surface's
 * one.
 *
 * It mirrors the real grid's structure rather than approximating it, because
 * both are swapped for each other on load: the sticky Mood and Day columns, the
 * same z-order, and the same rule on only one side of each shared edge (see
 * `TimeGrid` for why `border-separate` forces that). Shared so those rules are
 * stated once — they were duplicated, and fixing them meant editing two files.
 */
export function TimeGridSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto overscroll-y-none rounded-lg border border-border [touch-action:pan-x_pan-y]">
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
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              <td className="sticky left-0 z-20 bg-muted px-1 py-1 border-r border-border w-[52px]">
                <Skeleton className="size-4 rounded-full mx-auto" />
              </td>
              <td className="sticky left-[52px] z-20 bg-muted px-3 py-2 w-[120px] border-r border-border">
                <Skeleton className="h-3 w-16" />
              </td>
              {HOURS.map((h) => (
                <td key={h} className={`border-border h-9 min-w-[44px] ${h > 0 ? "border-l" : ""}`}>
                  {/* A scattered fill, so the placeholder reads as a painted day. */}
                  {((row * 24 + h) * 7 + row) % 5 === 0 && <Skeleton className="h-full w-full rounded-none" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
