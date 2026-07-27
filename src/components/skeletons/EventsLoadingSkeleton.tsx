"use client";

import { AppHeader } from "@/components/AppHeader";
import { Skeleton, SkeletonWave } from "@/components/ui/skeleton";
import { getApp } from "@/lib/shared/apps";

const eventsApp = getApp("events");

function EventCardBone() {
  return (
    <div className="mb-5 break-inside-avoid rounded-2xl border border-border/65 bg-card/60 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2.5 pr-16">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-28" />
          <div className="flex gap-1.5 pt-1">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-page events skeleton. Shared by the route `loading.tsx` (navigation
 * fallback) and the cold-start boot skeleton so both look identical. Mirrors
 * the /events page: sticky header, a segmented tab control, then a card list.
 */
export function EventsLoadingSkeleton() {
  return (
    <>
      <AppHeader app={eventsApp} />
      <div className="mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        {/* Segmented tab control (All / Scheduled / Overdue / Timeline) */}
        <div className="mt-2 flex items-center justify-center sm:mt-4">
          <div className="inline-flex gap-1 rounded-full border border-border/60 bg-card/50 p-1">
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>

        <div className="mt-6 mb-6 flex items-baseline gap-3">
          <Skeleton className="h-3 w-24" />
          <div className="h-px flex-1 bg-border/40" />
        </div>

        <SkeletonWave className="columns-1 gap-5 md:columns-2 lg:columns-3">
          <EventCardBone />
          <EventCardBone />
          <EventCardBone />
          <EventCardBone />
          <EventCardBone />
          <EventCardBone />
        </SkeletonWave>
      </div>
    </>
  );
}
