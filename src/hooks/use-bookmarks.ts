"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";

import { useSystemPageBlocks, useSystemPageBlocksPaged, type SystemPageBlockRow } from "@/hooks/use-system-page-blocks";
import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { systemPageId } from "@/lib/notes/system-pages";
import { searchEntities } from "@/lib/search/query";
import {
  BOOKMARK_BLOCK_TYPE,
  BOOKMARKS_KEY,
  parseBookmarkContent,
  type Bookmark,
} from "@/lib/bookmarks/bookmarks";

function toBookmark(row: SystemPageBlockRow): Bookmark {
  const { url, title, note, favorite, unread, addedAt } = parseBookmarkContent(row.content);
  return { id: row.id, url, title, note, favorite, unread, addedAt, sortRank: row.sort_rank ?? "" };
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
    // Match-any via the indexed entity_tags join.
    conds.push(`id IN (SELECT entity_id FROM entity_tags WHERE entity_kind = 'bookmark' AND tag_id IN (${opts.tagIds.map(() => "?").join(",")}))`);
    args.push(...opts.tagIds);
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

/**
 * Ranked full-text bookmark search via the FTS5 index (typo-tolerant, prefix,
 * relevance-ordered). Returns the full matched bookmarks in rank order; the
 * caller applies any tag filter and windows the result. `enabled` gates it —
 * pass `isSearchIndexReady() && term` and fall back to {@link useBookmarksPage}'s
 * SQL `LIKE` when it's false. Runs the search imperatively (debounced), then
 * hydrates full rows reactively so cards stay live.
 */
export function useBookmarkSearch(query: string, enabled: boolean): { results: Bookmark[]; isLoading: boolean } {
  const [ids, setIds] = useState<string[]>([]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!enabled) {
        if (!cancelled) {
          setIds([]);
          setSettled(false);
        }
        return;
      }
      const hits = await searchEntities(query, { kinds: ["bookmark"], limit: 500 });
      if (cancelled) return;
      setIds(hits.map((h) => h.id));
      setSettled(true);
    }, enabled ? 120 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, query]);

  const { data = [] } = useQuery<SystemPageBlockRow>(
    ids.length
      ? `SELECT id, content, sort_rank FROM blocks WHERE id IN (${ids.map(() => "?").join(",")}) AND deleted_at IS NULL`
      : "SELECT id, content, sort_rank FROM blocks WHERE 1 = 0",
    ids,
  );

  const results = useMemo(() => {
    const byId = new Map(data.map((r) => [r.id, toBookmark(r)]));
    return ids.map((id) => byId.get(id)).filter((b): b is Bookmark => !!b);
  }, [ids, data]);

  return { results, isLoading: enabled && !settled };
}

/** Grand total + the set of tag ids actually used, for the filter row — computed
 * across ALL bookmarks (not just the loaded window). */
export function useBookmarkFacets(): { total: number; usedTagIds: Set<string> } {
  const userId = useCurrentUserId();
  const pageId = userId ? systemPageId(userId, "bookmark", BOOKMARKS_KEY) : null;

  const { data: countRows = [] } = useQuery<{ c: number }>(
    pageId ? "SELECT COUNT(*) AS c FROM blocks WHERE page_id = ? AND type = ? AND deleted_at IS NULL" : "SELECT 0 AS c WHERE 0",
    pageId ? [pageId, BOOKMARK_BLOCK_TYPE] : [],
  );
  const { data: tagRows = [] } = useQuery<{ id: string | null }>(
    "SELECT DISTINCT tag_id AS id FROM entity_tags WHERE entity_kind = 'bookmark'",
  );

  const usedTagIds = useMemo(
    () => new Set(tagRows.map((r) => r.id).filter((x): x is string => !!x)),
    [tagRows],
  );
  return { total: countRows[0]?.c ?? 0, usedTagIds };
}
