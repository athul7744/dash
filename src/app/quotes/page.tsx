"use client";

import { useState } from "react";
import { Plus, Quote as QuoteIcon } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { DashboardQuote } from "@/components/dashboard/DashboardQuote";
import { QuoteCard } from "@/components/quotes/QuoteCard";
import { useQuotes } from "@/hooks/use-quotes";
import { createQuote } from "@/lib/quotes/quotes";
import { getApp } from "@/lib/shared/apps";

const quotesApp = getApp("quotes");

export default function QuotesPage() {
  const { quotes, isLoading } = useQuotes();
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const addQuote = async () => {
    const id = await createQuote();
    setJustCreatedId(id);
  };

  return (
    <>
      <AppHeader
        app={quotesApp}
        actions={
          <button
            type="button"
            onClick={addQuote}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-rose-600 dark:hover:text-rose-400"
          >
            <Plus className="h-4 w-4" />
            Add quote
          </button>
        }
      />

      <div className="mx-auto max-w-2xl px-[var(--app-gutter-x)] py-8 pb-40">
        {isLoading ? null : quotes.length === 0 ? (
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
            <DashboardQuote showAllLink={false} />
            <div className="flex flex-col gap-4">
              {quotes.map((quote) => (
                <QuoteCard key={quote.id} quote={quote} autoFocus={quote.id === justCreatedId} />
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
            Add quote
          </button>
        }
      />
    </>
  );
}
