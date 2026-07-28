"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";
import { format } from "date-fns";

import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { systemPageId } from "@/lib/notes/system-pages";

/** The journal page key for a given day — one lazily-created page per date. */
export function journalDayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Given a set of days, returns the subset (as day keys) that already have a
 * journal page — i.e. days the user has actually written on. One indexed
 * `id IN (...)` lookup over the deterministic page ids; pass a memoized `dates`.
 */
export function useJournalEntryDays(dates: Date[]): Set<string> {
  const userId = useCurrentUserId();
  const keys = useMemo(() => dates.map(journalDayKey), [dates]);
  const ids = useMemo(
    () => (userId ? keys.map((k) => systemPageId(userId, "journal", k)) : []),
    [userId, keys],
  );
  const sql = ids.length
    ? `SELECT id FROM pages WHERE id IN (${ids.map(() => "?").join(",")})`
    : "SELECT id FROM pages WHERE 1 = 0";
  const { data = [] } = useQuery<{ id: string }>(sql, ids);

  return useMemo(() => {
    const idToKey = new Map(ids.map((id, i) => [id, keys[i]]));
    return new Set(data.map((r) => idToKey.get(r.id)).filter((k): k is string => Boolean(k)));
  }, [data, ids, keys]);
}
