"use client";

/**
 * A watched query that remembers what it last showed.
 *
 * Navigating between apps unmounts the screen you leave, and with it every
 * query it was watching. Coming back builds them again from nothing: `isLoading`
 * is true, the skeleton returns, and a screen you were looking at a second ago
 * is assembled from scratch. That is the difference between an app and a
 * website, and no amount of latching inside the component can fix it — the latch
 * dies with the component.
 *
 * So the last result each query settled on is kept outside React, keyed by the
 * query and its parameters. A remount paints those rows immediately and the real
 * query replaces them when it returns, which on a local database is a few
 * milliseconds later.
 *
 * The alternative — keeping the `WatchedQuery` itself alive between mounts — was
 * not taken. A live query re-runs on every write to the tables it reads, so
 * every screen you had ever visited would go on querying in the background while
 * you used a different one. Remembering the rows costs nothing while you are
 * away and buys the same first paint.
 *
 * What it does not do is make stale data look fresh: the remembered rows are
 * only ever shown while a query has no result of its own, and only to the query
 * that produced them.
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@powersync/react";

/**
 * How many result sets to keep. Comfortably more than the screens one session
 * touches, and bounded so a long session can't grow without limit.
 */
const MAX_REMEMBERED = 48;

const remembered = new Map<string, readonly unknown[]>();

/** Read without reordering — this is called during render. */
function recall(key: string): readonly unknown[] | undefined {
  return remembered.get(key);
}

/** Record a settled result as the newest, evicting the least recently settled. */
function remember(key: string, rows: readonly unknown[]): void {
  remembered.delete(key);
  remembered.set(key, rows);
  while (remembered.size > MAX_REMEMBERED) {
    const oldest = remembered.keys().next().value;
    if (oldest === undefined) break;
    remembered.delete(oldest);
  }
}

/** Forget everything — for a local-database reset, and for tests. */
export function clearRememberedQueries(): void {
  remembered.clear();
}

/** How many result sets are being held. Exposed for tests. */
export function rememberedQueryCount(): number {
  return remembered.size;
}

export type CachedQueryResult<T> = {
  data: T[];
  /** True only when there is nothing to show — not merely when a query is running. */
  isLoading: boolean;
};

/**
 * Drop-in for `useQuery` on a screen-level list.
 *
 * Worth it where a screen is mounted, left and returned to. Not worth it for a
 * lookup by id, which is cheap and specific to one thing on screen.
 */
export function useCachedQuery<T>(sql: string, params: readonly unknown[] = []): CachedQueryResult<T> {
  const key = useMemo(() => `${sql}\u0000${JSON.stringify(params)}`, [sql, params]);

  // `useQuery` compares parameters by value, so a fresh array each render is
  // fine; it re-subscribes only when the query or the values actually change.
  const { data = [], isLoading } = useQuery<T>(sql, params as unknown[]);

  useEffect(() => {
    if (!isLoading) remember(key, data);
  }, [key, data, isLoading]);

  const fallback = isLoading ? (recall(key) as T[] | undefined) : undefined;

  return {
    data: fallback ?? data,
    isLoading: isLoading && fallback === undefined,
  };
}
