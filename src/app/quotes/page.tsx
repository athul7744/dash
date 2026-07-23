"use client";

import { useState } from "react";
import { Plus, Quote as QuoteIcon } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { CollectionHeading } from "@/components/CollectionHeading";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { DashboardQuote } from "@/components/dashboard/DashboardQuote";
import { QuoteCard } from "@/components/quotes/QuoteCard";
import { QuotesLoadingSkeleton } from "@/components/skeletons/QuotesLoadingSkeleton";
import { useQuotes } from "@/hooks/use-quotes";
import { useNewItemParam } from "@/hooks/use-new-item-param";
import { createQuote } from "@/lib/quotes/quotes";
import { getApp, HEADER_ACTION_BASE } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

const quotesApp = getApp("quotes");

export default function QuotesPage() {
  const { quotes, isLoading } = useQuotes();
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

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

      <div className="mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        {quotes.length === 0 ? (
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
            <CollectionHeading label="All quotes" count={quotes.length} className="mt-12 mb-6 sm:mt-16" />

            {/* Masonry — variable-height cards pack tightly into columns. */}
            <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
              {quotes.map((quote) => (
                <div key={quote.id} className="mb-5 break-inside-avoid">
                  <QuoteCard quote={quote} autoFocus={quote.id === justCreatedId} />
                </div>
              ))}
            </div>
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
