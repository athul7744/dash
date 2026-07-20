"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";

import { systemPageId } from "@/lib/notes/system-pages";
import { materializeDueReminders } from "@/lib/reminders/materialize";
import {
  parseReminderContent,
  REMINDER_BLOCK_TYPE,
  REMINDERS_KEY,
  type Reminder,
} from "@/lib/reminders/reminders";
import { getCurrentUserId } from "@/lib/shared/auth";

type ReminderBlockRow = { id: string; content: string | null; sort_rank: string | null };

/** Resolve the current user's deterministic reminders page id (async → null first). */
export function useRemindersPageId(): string | null {
  const [pageId, setPageId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getCurrentUserId().then((userId) => {
      if (active) setPageId(systemPageId(userId, "reminder", REMINDERS_KEY));
    });
    return () => {
      active = false;
    };
  }, []);
  return pageId;
}

const EMPTY_QUERY = "SELECT id, content, sort_rank FROM blocks WHERE 1 = 0";

/** Live list of reminders, ordered by sort_rank. */
export function useReminders(): { reminders: Reminder[]; isLoading: boolean } {
  const pageId = useRemindersPageId();
  const query = pageId
    ? "SELECT id, content, sort_rank FROM blocks WHERE page_id = ? AND type = ? ORDER BY sort_rank ASC"
    : EMPTY_QUERY;
  const args = pageId ? [pageId, REMINDER_BLOCK_TYPE] : [];
  const { data = [], isLoading, isFetching } = useQuery<ReminderBlockRow>(query, args, { reportFetching: true });

  // Latch "settled" the first time the real query returns a non-fetching result,
  // bridging the EMPTY_QUERY→real-query swap so the empty state can't flash.
  const [settled, setSettled] = useState(false);
  if (!settled && pageId !== null && !isLoading && !isFetching) {
    setSettled(true);
  }

  const reminders = useMemo<Reminder[]>(
    () =>
      data.map((row) => ({
        id: row.id,
        sortRank: row.sort_rank ?? "",
        ...parseReminderContent(row.content),
      })),
    [data],
  );

  return { reminders, isLoading: !settled };
}

/**
 * Fire the reminder reconciler once on mount as a fire-and-forget effect —
 * idempotent, so mounting on both the dashboard and the /reminders page (and
 * StrictMode double-invoke) is safe.
 */
export function useReminderMaterializer(): void {
  useEffect(() => {
    void materializeDueReminders();
  }, []);
}
