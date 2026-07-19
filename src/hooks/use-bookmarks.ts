"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";

import {
  BOOKMARK_BLOCK_TYPE,
  BOOKMARKS_KEY,
  parseBookmarkContent,
  type Bookmark,
} from "@/lib/bookmarks/bookmarks";
import { systemPageId } from "@/lib/notes/system-pages";
import { getCurrentUserId } from "@/lib/shared/auth";

type BookmarkBlockRow = { id: string; content: string | null; sort_rank: string | null };

/** Resolve the current user's deterministic bookmarks page id (async → null first). */
export function useBookmarksPageId(): string | null {
  const [pageId, setPageId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getCurrentUserId().then((userId) => {
      if (active) setPageId(systemPageId(userId, "bookmark", BOOKMARKS_KEY));
    });
    return () => {
      active = false;
    };
  }, []);
  return pageId;
}

const EMPTY_QUERY = "SELECT id, content, sort_rank FROM blocks WHERE 1 = 0";

/** Live list of bookmarks, ordered by sort_rank. */
export function useBookmarks(): { bookmarks: Bookmark[]; isLoading: boolean } {
  const pageId = useBookmarksPageId();
  const query = pageId
    ? "SELECT id, content, sort_rank FROM blocks WHERE page_id = ? AND type = ? ORDER BY sort_rank ASC"
    : EMPTY_QUERY;
  const args = pageId ? [pageId, BOOKMARK_BLOCK_TYPE] : [];
  const { data = [], isLoading, isFetching } = useQuery<BookmarkBlockRow>(query, args, { reportFetching: true });

  // Latch "settled" the first time the real query returns a non-fetching result.
  // This bridges the brief EMPTY_QUERY→real-query swap (where useQuery reports
  // isLoading=false with stale []), so the empty state can't flash before the
  // rows arrive. Once settled it never flips back, so live updates don't blank.
  const [settled, setSettled] = useState(false);
  if (!settled && pageId !== null && !isLoading && !isFetching) {
    setSettled(true);
  }

  const bookmarks = useMemo<Bookmark[]>(
    () =>
      data.map((row) => {
        const { url, title, note, tags, favorite, unread, addedAt } = parseBookmarkContent(row.content);
        return { id: row.id, url, title, note, tags, favorite, unread, addedAt, sortRank: row.sort_rank ?? "" };
      }),
    [data],
  );

  return { bookmarks, isLoading: !settled };
}
