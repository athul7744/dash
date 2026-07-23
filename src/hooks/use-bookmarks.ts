"use client";

import { useSystemPageBlocks, type SystemPageBlockRow } from "@/hooks/use-system-page-blocks";
import {
  BOOKMARK_BLOCK_TYPE,
  BOOKMARKS_KEY,
  parseBookmarkContent,
  type Bookmark,
} from "@/lib/bookmarks/bookmarks";

function toBookmark(row: SystemPageBlockRow): Bookmark {
  const { url, title, note, tags, favorite, unread, addedAt } = parseBookmarkContent(row.content);
  return { id: row.id, url, title, note, tags, favorite, unread, addedAt, sortRank: row.sort_rank ?? "" };
}

/** Live list of bookmarks, ordered by sort_rank. */
export function useBookmarks(): { bookmarks: Bookmark[]; isLoading: boolean } {
  const { items, isLoading } = useSystemPageBlocks("bookmark", BOOKMARKS_KEY, BOOKMARK_BLOCK_TYPE, toBookmark);
  return { bookmarks: items, isLoading };
}
