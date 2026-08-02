"use client";

import { useSystemPageBlocks, useSystemPageBlocksPaged, type SystemPageBlockRow } from "@/hooks/use-system-page-blocks";
import { parseQuoteContent, QUOTE_BLOCK_TYPE, QUOTES_KEY, type Quote } from "@/lib/quotes/quotes";

function toQuote(row: SystemPageBlockRow): Quote {
  const { text, author, favorite } = parseQuoteContent(row.content);
  return { id: row.id, text, author, favorite, sortRank: row.sort_rank ?? "" };
}

/** Live list of quotes, ordered by sort_rank. */
export function useQuotes(): { quotes: Quote[]; isLoading: boolean } {
  const { items, isLoading } = useSystemPageBlocks("quote", QUOTES_KEY, QUOTE_BLOCK_TYPE, toQuote);
  return { quotes: items, isLoading };
}

/** A `limit`-sized window of quotes plus the total, for infinite scroll. */
export function useQuotesPage(limit: number): { quotes: Quote[]; total: number; isLoading: boolean } {
  const { items, total, isLoading } = useSystemPageBlocksPaged("quote", QUOTES_KEY, QUOTE_BLOCK_TYPE, toQuote, { limit });
  return { quotes: items, total, isLoading };
}
