"use client";

import { AppHeader } from "@/components/AppHeader";
import { getApp } from "@/lib/shared/apps";

const eventsApp = getApp("events");

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

/**
 * Full-page skeleton for the event detail view. Used by the `[id]/loading.tsx`
 * navigation fallback and while the single-event query settles. Mirrors the
 * detail layout: hero, schedule strip, stat tiles, heatmap card, and the log.
 */
export function EventDetailLoadingSkeleton() {
  return (
    <>
      <AppHeader app={eventsApp} />
      <div className="mx-auto max-w-2xl px-[var(--app-gutter-x)] py-8 pb-40 lg:max-w-7xl">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-8">
          {/* left: overview */}
          <div className="min-w-0">
            {/* hero */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-3">
                <Bone className="h-3 w-24" />
                <Bone className="h-8 w-3/5" />
                <Bone className="h-4 w-40" />
              </div>
              <Bone className="h-7 w-24 rounded-full" />
            </div>

            {/* schedule strip */}
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-border/65 bg-card/50 p-4">
              <Bone className="h-4 w-4 shrink-0 rounded-full" />
              <Bone className="h-4 flex-1" />
              <Bone className="h-7 w-28 shrink-0 rounded-full" />
            </div>

            {/* stats */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border/65 bg-card/50 p-3.5">
                  <Bone className="h-2.5 w-14" />
                  <Bone className="mt-2 h-5 w-16" />
                </div>
              ))}
            </div>

            {/* heatmap */}
            <div className="mt-6 rounded-xl border border-border/65 bg-card/50 p-4">
              <Bone className="h-3 w-24" />
              <Bone className="mt-3 h-24 w-full" />
            </div>
          </div>

          {/* right: log */}
          <div className="mt-8 min-w-0 lg:mt-0">
            <div className="mb-3 flex items-center justify-between">
              <Bone className="h-3 w-16" />
              <Bone className="h-7 w-40 rounded-full" />
            </div>
            <div className="overflow-hidden rounded-xl border border-border/65">
              <Bone className="h-6 w-full rounded-none" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5 last:border-b-0">
                  <Bone className="h-4 w-24 shrink-0" />
                  <Bone className="h-3 w-16 shrink-0" />
                  <Bone className="h-3 flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
