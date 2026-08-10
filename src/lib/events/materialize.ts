import { v5 as uuidv5 } from "uuid";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { SYSTEM_PAGE_NAMESPACE, systemPageId } from "@/lib/notes/system-pages";
import { dueOccurrence } from "@/lib/events/schedule";
import {
  logOccurrence,
  markLogged,
  markMaterialized,
  markTaskGenerated,
  parseEventContent,
  EVENT_BLOCK_TYPE,
  EVENTS_KEY,
  OCCURRENCE_BLOCK_TYPE,
  OCCURRENCE_SUBJECT_SQL,
  type OccurrenceSource,
} from "@/lib/events/events";
import { createTask } from "@/lib/tasks/create-task";

/** An event's tag ids — membership lives in `entity_tags`, not `content.tags`. */
async function eventTagIds(eventId: string): Promise<string[]> {
  const rows = await db.getAll<{ tag_id: string }>(
    `SELECT tag_id FROM entity_tags WHERE entity_id = ? AND entity_kind = 'event'`,
    [eventId],
  );
  return rows.map((r) => r.tag_id);
}

/**
 * Manually spawn a one-off task from an event, on demand — the user-fired
 * counterpart to the scheduler. Copies the event's title / link / tags / priority
 * (due today) and wires the task into the same complete→log slot the reconciler
 * watches, so finishing it logs an occurrence (source "task"), exactly like a
 * scheduled task. Works for log-only events too. Returns the new task id, or null
 * if the event is missing or untitled.
 */
export async function generateTaskForEvent(eventId: string): Promise<string | null> {
  const row = await db.getOptional<{ content: string | null }>(
    `SELECT content FROM blocks WHERE id = ? AND type = ? AND deleted_at IS NULL LIMIT 1`,
    [eventId, EVENT_BLOCK_TYPE],
  );
  if (!row) return null;
  const thing = parseEventContent(row.content);
  if (!thing.title.trim()) return null;

  const taskId = await createTask({
    title: thing.title,
    link: thing.link || null,
    dueDate: new Date(),
    tags: await eventTagIds(eventId),
    priority: thing.priority,
  });
  await markTaskGenerated(eventId, taskId);
  return taskId;
}

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
 *
 * Serialized: concurrent calls (React StrictMode double-invokes the effect, and
 * the dashboard + /events can both fire it) coalesce onto one in-flight run.
 * Without this the read-then-write branches race — two passes double-log a
 * completion, and both `INSERT` the same deterministic task id (UNIQUE failure).
 */
let inFlight: Promise<number> | null = null;

export function materializeDueEvents(): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = runMaterialize().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runMaterialize(): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) return 0;

  const pageId = systemPageId(userId, "event", EVENTS_KEY);
  const rows = await db.getAll<{ id: string; content: string | null }>(
    // Trashed events must not keep spawning tasks or logging occurrences.
    `SELECT id, content FROM blocks WHERE page_id = ? AND type = ? AND deleted_at IS NULL`,
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
        // A `manual:` key marks an ad-hoc (user-generated) task — log it as
        // source "task"; a scheduled task logs as "schedule".
        const source: OccurrenceSource = thing.lastMaterializedKey.startsWith("manual:") ? "task" : "schedule";
        // Deterministic id: a duplicate pass writes the same row (INSERT OR IGNORE),
        // so the completion can never be double-logged.
        const occId = uuidv5(`${subjectId}:log:${thing.lastMaterializedKey}`, SYSTEM_PAGE_NAMESPACE);
        await logOccurrence(subjectId, { id: occId, at: task.updated_at ?? now.toISOString(), source, subjectKind });
        await markLogged(row.id, thing.lastMaterializedKey);
      }
    }

    if (!thing.active || !thing.schedule) continue;

    // (2) Due → materialize. An interval schedule is anchored to the last log.
    let lastOccurrence: Date | null = null;
    if (thing.schedule.freq === "interval") {
      const agg = await db.getOptional<{ last: string | null }>(
        `SELECT MAX(json_extract(content, '$.at')) AS last FROM blocks WHERE type = ? AND deleted_at IS NULL AND ${OCCURRENCE_SUBJECT_SQL} = ?`,
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
        tags: await eventTagIds(row.id),
        priority: thing.priority,
      });
      created += 1;
    }

    await markMaterialized(row.id, due.key, taskId);
  }

  return created;
}
