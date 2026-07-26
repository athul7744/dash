import { v5 as uuidv5 } from "uuid";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { SYSTEM_PAGE_NAMESPACE, systemPageId } from "@/lib/notes/system-pages";
import { dueOccurrence } from "@/lib/events/schedule";
import {
  logOccurrence,
  markLogged,
  markMaterialized,
  parseEventContent,
  EVENT_BLOCK_TYPE,
  EVENTS_KEY,
  OCCURRENCE_BLOCK_TYPE,
  OCCURRENCE_SUBJECT_SQL,
} from "@/lib/events/events";
import { createTask } from "@/lib/tasks/create-task";

/**
 * Client-side reconciler for scheduled Events. Fired on mount (dashboard +
 * /events) — there is no server cron. Idempotent and StrictMode-safe. Two jobs:
 *
 *  1. **Complete → log.** If a thing's last materialized task is now `completed`
 *     and that occurrence hasn't been logged yet, record an occurrence (source
 *     "schedule") at the task's completion time — closing the doing→record loop
 *     so last-done / cadence stay accurate and an `interval` schedule advances.
 *  2. **Due → materialize.** Turn a due schedule into a real Task, gated by
 *     `lastMaterializedKey` (no re-create after resolve), a deterministic task id
 *     (cross-device dedupe), and the pending-gate (don't stack while the previous
 *     task is still open). Log-only things (`schedule == null`) are skipped.
 *
 * Returns the number of tasks created.
 */
export async function materializeDueEvents(): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) return 0;

  const pageId = systemPageId(userId, "event", EVENTS_KEY);
  const rows = await db.getAll<{ id: string; content: string | null }>(
    `SELECT id, content FROM blocks WHERE page_id = ? AND type = ?`,
    [pageId, EVENT_BLOCK_TYPE],
  );

  const now = new Date();
  let created = 0;

  for (const row of rows) {
    const thing = parseEventContent(row.content);
    if (!thing.title.trim()) continue;

    // The event may track an external subject; its logs land there (else itself).
    const subjectId = thing.subjectId ?? row.id;
    const subjectKind = thing.subjectKind ?? "event";

    // (1) Complete → log: the last materialized task was finished.
    if (thing.lastTaskId && thing.lastMaterializedKey && thing.lastLoggedKey !== thing.lastMaterializedKey) {
      const task = await db.getOptional<{ state: string; updated_at: string | null }>(
        `SELECT state, updated_at FROM tasks WHERE id = ? LIMIT 1`,
        [thing.lastTaskId],
      );
      if (task?.state === "completed") {
        await logOccurrence(subjectId, { at: task.updated_at ?? now.toISOString(), source: "schedule", subjectKind });
        await markLogged(row.id, thing.lastMaterializedKey);
      }
    }

    if (!thing.active || !thing.schedule) continue;

    // (2) Due → materialize. An interval schedule is anchored to the last log.
    let lastOccurrence: Date | null = null;
    if (thing.schedule.freq === "interval") {
      const agg = await db.getOptional<{ last: string | null }>(
        `SELECT MAX(json_extract(content, '$.at')) AS last FROM blocks WHERE type = ? AND ${OCCURRENCE_SUBJECT_SQL} = ?`,
        [OCCURRENCE_BLOCK_TYPE, subjectId],
      );
      lastOccurrence = agg?.last ? new Date(agg.last) : null;
    }

    const due = dueOccurrence(
      {
        schedule: thing.schedule,
        daysBefore: thing.daysBefore,
        lastMaterializedKey: thing.lastMaterializedKey,
        lastOccurrence,
      },
      now,
    );
    if (!due) continue;

    // Pending-gate: don't stack a new task while the previous one is still open.
    if (thing.lastTaskId) {
      const prev = await db.getOptional<{ state: string }>(`SELECT state FROM tasks WHERE id = ? LIMIT 1`, [thing.lastTaskId]);
      if (prev && prev.state === "pending") continue;
    }

    const taskId = uuidv5(`${row.id}:${due.key}`, SYSTEM_PAGE_NAMESPACE);
    const exists = await db.getOptional<{ id: string }>(`SELECT id FROM tasks WHERE id = ? LIMIT 1`, [taskId]);
    if (!exists) {
      await createTask({
        id: taskId,
        title: thing.title,
        link: thing.link || null,
        dueDate: due.occurrence,
        tags: thing.tags,
        priority: thing.priority,
      });
      created += 1;
    }

    await markMaterialized(row.id, due.key, taskId);
  }

  return created;
}
