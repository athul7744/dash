"use client";

import { useEffect } from "react";

import { useSystemPageBlocks, type SystemPageBlockRow } from "@/hooks/use-system-page-blocks";
import { materializeDueReminders } from "@/lib/reminders/materialize";
import {
  parseReminderContent,
  REMINDER_BLOCK_TYPE,
  REMINDERS_KEY,
  type Reminder,
} from "@/lib/reminders/reminders";

function toReminder(row: SystemPageBlockRow): Reminder {
  return { id: row.id, sortRank: row.sort_rank ?? "", ...parseReminderContent(row.content) };
}

/** Live list of reminders, ordered by sort_rank. */
export function useReminders(): { reminders: Reminder[]; isLoading: boolean } {
  const { items, isLoading } = useSystemPageBlocks("reminder", REMINDERS_KEY, REMINDER_BLOCK_TYPE, toReminder);
  return { reminders: items, isLoading };
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
