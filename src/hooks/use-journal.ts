"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";
import { format } from "date-fns";

import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { ensureSystemPage } from "@/lib/notes/notes";
import { JOURNAL_TITLE_PREFIX, systemPageId } from "@/lib/notes/system-pages";

/** The journal page key for a given day — one lazily-created page per date. */
export function journalDayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** What a day's journal page is titled — also the label a day reference wears. */
export function journalPageTitle(date: Date): string {
  return `${JOURNAL_TITLE_PREFIX}${format(date, "EEE, MMM d, yyyy")}`;
}

/**
 * Ensure a day's journal page exists, and return its id.
 *
 * Two callers: the entry itself, on the first keystroke, and linking a day —
 * a reference needs a real row to point at, since that's what an `edges`
 * endpoint resolves against.
 */
export async function ensureJournalPage(date: Date): Promise<string> {
  return ensureSystemPage({
    kind: "journal",
    key: journalDayKey(date),
    title: journalPageTitle(date),
    createStarterBlock: false,
  });
}

/**
 * Given a set of days, returns the subset (as day keys) the user has actually
 * written on. One indexed `page_id IN (...)` lookup over the deterministic page
 * ids; pass a memoized `dates`.
 *
 * The test is blocks, not the page: linking a day creates its page so the
 * reference has a row to resolve against, and that page has no blocks. Asking
 * for the page instead would make every linked day read as written on, so a day
 * you have only mentioned would open its editor rather than its prompt.
 */
export function useJournalEntryDays(dates: Date[]): Set<string> {
  const userId = useCurrentUserId();
  const keys = useMemo(() => dates.map(journalDayKey), [dates]);
  const ids = useMemo(
    () => (userId ? keys.map((k) => systemPageId(userId, "journal", k)) : []),
    [userId, keys],
  );
  const sql = ids.length
    ? `SELECT DISTINCT page_id AS id FROM blocks
       WHERE page_id IN (${ids.map(() => "?").join(",")}) AND deleted_at IS NULL`
    : "SELECT NULL AS id WHERE 1 = 0";
  const { data = [] } = useQuery<{ id: string }>(sql, ids);

  return useMemo(() => {
    const idToKey = new Map(ids.map((id, i) => [id, keys[i]]));
    return new Set(data.map((r) => idToKey.get(r.id)).filter((k): k is string => Boolean(k)));
  }, [data, ids, keys]);
}
