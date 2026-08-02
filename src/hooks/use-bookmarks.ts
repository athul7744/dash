"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import { useSystemPageBlocks, useSystemPageBlocksPaged, type SystemPageBlockRow } from "@/hooks/use-system-page-blocks";
import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { systemPageId } from "@/lib/notes/system-pages";
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

/**
 * A `limit`-sized window of bookmarks (for infinite scroll), filtered in SQL by
 * any selected `tagIds` (match one) and a `search` term (title/note/url), so the
 * filter runs before the LIMIT rather than on an already-truncated window.
 */
export function useBookmarksPage(opts: { limit: number; tagIds: string[]; search: string }): {
  bookmarks: Bookmark[];
  total: number;
  isLoading: boolean;
} {
  const conds: string[] = [];
  const args: (string | number)[] = [];

  if (opts.tagIds.length > 0) {
    conds.push(`(${opts.tagIds.map(() => "content LIKE ?").join(" OR ")})`);
    args.push(...opts.tagIds.map((id) => `%"${id}"%`));
  }
  const search = opts.search.trim();
  if (search) {
    // json_extract keeps the match to real fields, not JSON keys/ids.
    conds.push(`(json_extract(content,'$.title') LIKE ? OR json_extract(content,'$.note') LIKE ? OR json_extract(content,'$.url') LIKE ?)`);
    const like = `%${search}%`;
    args.push(like, like, like);
  }

  const { items, total, isLoading } = useSystemPageBlocksPaged("bookmark", BOOKMARKS_KEY, BOOKMARK_BLOCK_TYPE, toBookmark, {
    limit: opts.limit,
    where: conds.length ? conds.join(" AND ") : undefined,
    whereArgs: args,
  });
  return { bookmarks: items, total, isLoading };
}

/** Grand total + the set of tag ids actually used, for the filter row — computed
 * across ALL bookmarks (not just the loaded window). */
export function useBookmarkFacets(): { total: number; usedTagIds: Set<string> } {
  const userId = useCurrentUserId();
  const pageId = userId ? systemPageId(userId, "bookmark", BOOKMARKS_KEY) : null;

  const { data: countRows = [] } = useQuery<{ c: number }>(
    pageId ? "SELECT COUNT(*) AS c FROM blocks WHERE page_id = ? AND type = ?" : "SELECT 0 AS c WHERE 0",
    pageId ? [pageId, BOOKMARK_BLOCK_TYPE] : [],
  );
  const { data: tagRows = [] } = useQuery<{ id: string | null }>(
    pageId
      ? "SELECT DISTINCT je.value AS id FROM blocks, json_each(COALESCE(json_extract(content,'$.tags'),'[]')) je WHERE page_id = ? AND type = ?"
      : "SELECT NULL AS id WHERE 0",
    pageId ? [pageId, BOOKMARK_BLOCK_TYPE] : [],
  );

  const usedTagIds = useMemo(
    () => new Set(tagRows.map((r) => r.id).filter((x): x is string => !!x)),
    [tagRows],
  );
  return { total: countRows[0]?.c ?? 0, usedTagIds };
}
