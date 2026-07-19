"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";

import { getCurrentUserId } from "@/lib/shared/auth";
import { systemPageId } from "@/lib/notes/system-pages";
import { parseQuoteContent, QUOTE_BLOCK_TYPE, QUOTES_KEY, type Quote } from "@/lib/quotes/quotes";

type QuoteBlockRow = { id: string; content: string | null; sort_rank: string | null };

/** Resolve the current user's deterministic quotes page id (async → null first). */
export function useQuotesPageId(): string | null {
  const [pageId, setPageId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getCurrentUserId().then((userId) => {
      if (active) setPageId(systemPageId(userId, "quote", QUOTES_KEY));
    });
    return () => {
      active = false;
    };
  }, []);
  return pageId;
}

const EMPTY_QUERY = "SELECT id, content, sort_rank FROM blocks WHERE 1 = 0";

/** Live list of quotes, ordered by sort_rank. */
export function useQuotes(): { quotes: Quote[]; isLoading: boolean } {
  const pageId = useQuotesPageId();
  const query = pageId
    ? "SELECT id, content, sort_rank FROM blocks WHERE page_id = ? AND type = ? ORDER BY sort_rank ASC"
    : EMPTY_QUERY;
  const args = pageId ? [pageId, QUOTE_BLOCK_TYPE] : [];
  const { data = [], isLoading, isFetching } = useQuery<QuoteBlockRow>(query, args, { reportFetching: true });

  // Latch "settled" the first time the real query returns a non-fetching result.
  // This bridges the brief EMPTY_QUERY→real-query swap (where useQuery reports
  // isLoading=false with stale []), so the empty state can't flash before the
  // rows arrive. Once settled it never flips back, so live updates don't blank.
  const [settled, setSettled] = useState(false);
  if (!settled && pageId !== null && !isLoading && !isFetching) {
    setSettled(true);
  }

  const quotes = useMemo<Quote[]>(
    () =>
      data.map((row) => {
        const { text, author, favorite } = parseQuoteContent(row.content);
        return { id: row.id, text, author, favorite, sortRank: row.sort_rank ?? "" };
      }),
    [data],
  );

  return { quotes, isLoading: !settled };
}
