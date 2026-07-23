"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@powersync/react";

import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { systemPageId, type SystemPageKind } from "@/lib/notes/system-pages";

/** A raw block row from a system page: `{ id, content, sort_rank }`. */
export type SystemPageBlockRow = { id: string; content: string | null; sort_rank: string | null };

const EMPTY_QUERY = "SELECT id, content, sort_rank FROM blocks WHERE 1 = 0";
const LIST_QUERY =
  "SELECT id, content, sort_rank FROM blocks WHERE page_id = ? AND type = ? ORDER BY sort_rank ASC";

/**
 * Live list of the blocks on a feature-owned system page (bookmarks, quotes,
 * reminders), ordered by sort_rank and mapped through `parse`. This is the one
 * shape those three app-item hooks share: it resolves the deterministic page id
 * from the current user, runs the block query, and latches "settled" the first
 * time the real query returns a non-fetching result — bridging the brief
 * empty→real query swap so the empty state can't flash before rows arrive (once
 * settled it never flips back, so live updates don't blank).
 *
 * `parse` must be a stable reference (define it at module scope) so the memoized
 * mapping doesn't recompute every render.
 */
export function useSystemPageBlocks<T>(
  kind: SystemPageKind,
  key: string,
  blockType: string,
  parse: (row: SystemPageBlockRow) => T,
): { items: T[]; isLoading: boolean } {
  const userId = useCurrentUserId();
  const pageId = userId ? systemPageId(userId, kind, key) : null;

  const query = pageId ? LIST_QUERY : EMPTY_QUERY;
  const args = pageId ? [pageId, blockType] : [];
  const { data = [], isLoading, isFetching } = useQuery<SystemPageBlockRow>(query, args, { reportFetching: true });

  const [settled, setSettled] = useState(false);
  if (!settled && pageId !== null && !isLoading && !isFetching) {
    setSettled(true);
  }

  const items = useMemo(() => data.map(parse), [data, parse]);
  return { items, isLoading: !settled };
}
