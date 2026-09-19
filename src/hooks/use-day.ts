"use client";

/**
 * What every app recorded on one calendar day.
 *
 * The Day surface's reads, gathered here so the page stays layout. Each store
 * timestamps a **real instant** — `tasks.due_date` / `completed_at`, a
 * bookmark's `addedAt`, a quote's `addedAt`, `pages.created_at` — so they all
 * window on `localDayBounds`. The tracker's own rows are the exception and go
 * through `useTimeGrid`, which keeps the UTC-naive convention the grid is
 * written in.
 */

import { useQuery } from "@powersync/react";

import { useOccurrences } from "@/hooks/use-events";
import { BOOKMARKS_KEY, BOOKMARK_BLOCK_TYPE, parseBookmarkContent, type Bookmark } from "@/lib/bookmarks/bookmarks";
import { QUOTES_KEY, QUOTE_BLOCK_TYPE, parseQuoteContent, type Quote } from "@/lib/quotes/quotes";
import { useSystemPageBlocksPaged, type SystemPageBlockRow } from "@/hooks/use-system-page-blocks";
import type { Task } from "@/lib/powersync/AppSchema";
import { localDayBounds } from "@/lib/tracker/day-keys";

/** Enough of a page to list it — the day doesn't render note bodies. */
export interface DayNote {
  id: string;
  title: string | null;
}

export interface DayTasks {
  /** Top-level tasks whose due date lands on the day, trashed ones excluded. */
  due: (Task & { id: string })[];
  /** Tasks marked done on the day, whenever they were due. */
  completed: (Task & { id: string })[];
  isLoading: boolean;
}

const TASK_SELECT = "SELECT * FROM tasks WHERE state != 'trashed' AND parent_id IS NULL";

export function useDayTasks(dateKey: string): DayTasks {
  const [from, to] = localDayBounds(dateKey);

  const { data: due = [], isLoading: loadingDue } = useQuery<Task & { id: string }>(
    `${TASK_SELECT} AND due_date >= ? AND due_date < ? ORDER BY due_date ASC`,
    [from, to],
  );

  // Not filtered to the day's due tasks: what you finished today is its own
  // fact, and most of it was due some other day or not at all.
  const { data: completed = [], isLoading: loadingCompleted } = useQuery<Task & { id: string }>(
    `${TASK_SELECT} AND completed_at >= ? AND completed_at < ? ORDER BY completed_at ASC`,
    [from, to],
  );

  return { due, completed, isLoading: loadingDue || loadingCompleted };
}

/** Everything logged against an event on the day, newest first. */
export function useDayOccurrences(dateKey: string) {
  const [from, to] = localDayBounds(dateKey);
  return useOccurrences({ from, to });
}

export interface DayCaptures {
  bookmarks: Bookmark[];
  quotes: Quote[];
  notes: DayNote[];
  isLoading: boolean;
}

/** A capture window big enough that a day's intake is never truncated. */
const CAPTURE_LIMIT = 200;

const parseBookmarkRow = (row: SystemPageBlockRow): Bookmark => ({
  id: row.id,
  sortRank: row.sort_rank ?? "",
  ...parseBookmarkContent(row.content),
});

const parseQuoteRow = (row: SystemPageBlockRow): Quote => ({
  id: row.id,
  sortRank: row.sort_rank ?? "",
  ...parseQuoteContent(row.content),
});

/**
 * When a capture was kept.
 *
 * Bookmarks and quotes both stamp `addedAt` at creation, but rows saved before
 * that field existed carry none — and without a fallback an entire back
 * catalogue is invisible to every day. A block's `updated_at` is set on insert,
 * so for anything never edited since it *is* the capture time; for the rest it's
 * the best the row knows. The fallback stops applying the moment a row carries a
 * real `addedAt`, so it only ever covers the legacy tail.
 */
const CAPTURED_AT = "COALESCE(NULLIF(json_extract(content, '$.addedAt'), ''), updated_at)";

export function useDayCaptures(dateKey: string): DayCaptures {
  const [from, to] = localDayBounds(dateKey);
  const window = { where: `${CAPTURED_AT} >= ? AND ${CAPTURED_AT} < ?` };

  const { items: bookmarks, isLoading: loadingBookmarks } = useSystemPageBlocksPaged(
    "bookmark",
    BOOKMARKS_KEY,
    BOOKMARK_BLOCK_TYPE,
    parseBookmarkRow,
    { limit: CAPTURE_LIMIT, ...window, whereArgs: [from, to] },
  );

  const { items: quotes, isLoading: loadingQuotes } = useSystemPageBlocksPaged(
    "quote",
    QUOTES_KEY,
    QUOTE_BLOCK_TYPE,
    parseQuoteRow,
    { limit: CAPTURE_LIMIT, ...window, whereArgs: [from, to] },
  );

  const { data: notes = [], isLoading: loadingNotes } = useQuery<DayNote>(
    `SELECT id, title FROM pages
     WHERE created_at >= ? AND created_at < ?
       AND json_extract(properties, '$.kind') IS NULL
       AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [from, to],
  );

  return {
    bookmarks,
    quotes,
    notes,
    isLoading: loadingBookmarks || loadingQuotes || loadingNotes,
  };
}
