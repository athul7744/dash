"use client";

import { AppHeader } from "@/components/AppHeader";
import { getApp } from "@/lib/shared/apps";

const quotesApp = getApp("quotes");

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function QuoteCardBone({ lines = 2 }: { lines?: number }) {
  return (
    <div className="mb-5 break-inside-avoid rounded-2xl border border-border/65 bg-card/60 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Bone className="h-7 w-4 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2 pr-16">
          {Array.from({ length: lines }).map((_, i) => (
            <Bone key={i} className={i === lines - 1 ? "h-5 w-4/5" : "h-5 w-full"} />
          ))}
          <Bone className="mt-2 h-3.5 w-28" />
        </div>
      </div>
    </div>
  );
}

/**
 * Full-page quotes skeleton. Shared by the route `loading.tsx` (navigation
 * fallback) and the cold-start boot skeleton so both look identical. Mirrors
 * the /quotes page: sticky header, a "quote of the day" band, then a card list.
 */
export function QuotesLoadingSkeleton() {
  return (
    <>
      <AppHeader app={quotesApp} />
      <div className="mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        {/* Centered daily hero */}
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-6 sm:py-12">
          <div className="flex items-center gap-2">
            <Bone className="h-3.5 w-3.5 rounded-full" />
            <Bone className="h-3 w-28" />
          </div>
          <Bone className="h-7 w-4/5" />
          <Bone className="h-7 w-3/5" />
          <Bone className="mt-2 h-4 w-28" />
        </div>

        {/* Section break */}
        <div className="mt-12 mb-6 flex items-baseline gap-3 sm:mt-16">
          <Bone className="h-3 w-20" />
          <div className="h-px flex-1 bg-border/40" />
        </div>

        {/* Masonry */}
        <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
          <QuoteCardBone lines={2} />
          <QuoteCardBone lines={3} />
          <QuoteCardBone lines={2} />
          <QuoteCardBone lines={4} />
          <QuoteCardBone lines={2} />
          <QuoteCardBone lines={3} />
        </div>
      </div>
    </>
  );
}
