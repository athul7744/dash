import { v5 as uuidv5 } from "uuid";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { SYSTEM_PAGE_NAMESPACE, systemPageId } from "@/lib/notes/system-pages";
import { dueOccurrence } from "@/lib/reminders/schedule";
import {
  markMaterialized,
  parseReminderContent,
  REMINDER_BLOCK_TYPE,
  REMINDERS_KEY,
} from "@/lib/reminders/reminders";
import { createTask } from "@/lib/tasks/create-task";

/**
 * Client-side reconciler: turns due reminders into real Tasks. Fired on mount
 * (dashboard + /reminders) like `pruneEmptyJournalPages` — there is no server
 * cron. Idempotent and StrictMode-safe:
 *  - `lastMaterializedKey` stops a task being recreated after the user resolves
 *    it (survives deleting the generated task),
 *  - a deterministic task id (uuidv5 of reminder+occurrence) collapses a
 *    cross-device double-materialization before sync into one row,
 *  - the pending-gate skips a new occurrence while the previous task is still
 *    open, so tasks from one reminder never pile up.
 *
 * Returns the number of tasks created.
 */
export async function materializeDueReminders(): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) return 0;

  const pageId = systemPageId(userId, "reminder", REMINDERS_KEY);
  const rows = await db.getAll<{ id: string; content: string | null }>(
    `SELECT id, content FROM blocks WHERE page_id = ? AND type = ?`,
    [pageId, REMINDER_BLOCK_TYPE],
  );

  const now = new Date();
  let created = 0;

  for (const row of rows) {
    const reminder = parseReminderContent(row.content);
    if (!reminder.active || !reminder.title.trim()) continue;

    const due = dueOccurrence(reminder, now);
    if (!due) continue;

    // Pending-gate: don't stack a new task while the previous one is still open.
    if (reminder.lastTaskId) {
      const prev = await db.getOptional<{ state: string }>(
        `SELECT state FROM tasks WHERE id = ? LIMIT 1`,
        [reminder.lastTaskId],
      );
      if (prev && prev.state === "pending") continue;
    }

    // Deterministic id so two devices materializing the same occurrence agree.
    const taskId = uuidv5(`${row.id}:${due.key}`, SYSTEM_PAGE_NAMESPACE);
    const exists = await db.getOptional<{ id: string }>(
      `SELECT id FROM tasks WHERE id = ? LIMIT 1`,
      [taskId],
    );
    if (!exists) {
      await createTask({
        id: taskId,
        title: reminder.title,
        link: reminder.link || null,
        dueDate: due.occurrence,
        tags: reminder.tags,
        priority: reminder.priority,
      });
      created += 1;
    }

    await markMaterialized(row.id, due.key, taskId);
  }

  return created;
}
