"use client";

import { useState } from "react";
import { Loader2, Plus, Quote as QuoteIcon } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { CollectionHeading } from "@/components/CollectionHeading";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { DashboardQuote } from "@/components/dashboard/DashboardQuote";
import { QuoteCard } from "@/components/quotes/QuoteCard";
import { QuotesLoadingSkeleton } from "@/components/skeletons/QuotesLoadingSkeleton";
import { useQuotesPage } from "@/hooks/use-quotes";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useNewItemParam } from "@/hooks/use-new-item-param";
import { createQuote } from "@/lib/quotes/quotes";
import { getApp, HEADER_ACTION_BASE } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

const quotesApp = getApp("quotes");
const PAGE_SIZE = 24;

export default function QuotesPage() {
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const { quotes, total, isLoading } = useQuotesPage(loadedCount);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const hasMore = quotes.length < total;
  const sentinelRef = useInfiniteScroll(() => setLoadedCount((n) => n + PAGE_SIZE), hasMore && !isLoading);

  const addQuote = async () => {
    const id = await createQuote();
    setJustCreatedId(id);
  };

  // Command-palette "New quote" (?new=1) adds a fresh quote on arrival.
  useNewItemParam(addQuote, !isLoading);

  // Show the route skeleton until the first real result lands, so there's no
  // blank gap or empty-state flash between the boot skeleton and content.
  if (isLoading) return <QuotesLoadingSkeleton />;

  return (
    <>
      <AppHeader
        app={quotesApp}
        actions={
          <button
            type="button"
            onClick={addQuote}
            className={cn(HEADER_ACTION_BASE, quotesApp.accent.hoverText)}
          >
            <Plus className="h-4 w-4" />
            New quote
          </button>
        }
      />

      <div className="skeleton-settle-in mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="rounded-2xl bg-rose-500/10 p-3 dark:bg-rose-500/20">
              <QuoteIcon className="h-6 w-6 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="space-y-1">
              <p className="font-serif text-lg text-foreground">No quotes yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Collect lines worth remembering. One resurfaces on your dashboard each day.
              </p>
            </div>
            <button
              type="button"
              onClick={addQuote}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add your first quote
            </button>
          </div>
        ) : (
          <>
            <DashboardQuote variant="hero" showAllLink={false} />

            {/* Section break: the collection reads as a distinct zone from the daily hero. */}
            <CollectionHeading label="All quotes" count={total} className="mt-12 mb-6 sm:mt-16" />

            {/* Masonry — variable-height cards pack tightly into columns. content-visibility
                keeps off-screen cards from costing layout/paint, so the DOM stays flat. */}
            <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
              {quotes.map((quote) => (
                <div key={quote.id} className="mb-5 break-inside-avoid [content-visibility:auto] [contain-intrinsic-size:auto_180px]">
                  <QuoteCard quote={quote} autoFocus={quote.id === justCreatedId} />
                </div>
              ))}
            </div>

            {hasMore ? (
              <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more…
              </div>
            ) : total > PAGE_SIZE ? (
              <div className="py-8 text-center text-xs text-muted-foreground/70">All {total} quotes loaded</div>
            ) : null}
          </>
        )}
      </div>

      <MobileBottomFabs
        app={quotesApp}
        centerContent={
          <button
            type="button"
            onClick={addQuote}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
          >
            <Plus className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            New quote
          </button>
        }
      />
    </>
  );
}
