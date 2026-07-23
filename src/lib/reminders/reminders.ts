import { LexoRank } from "lexorank";
import { v4 as uuidv4 } from "uuid";

import { deleteEntityEdges } from "@/lib/links/links";
import { ensureSystemPage } from "@/lib/notes/notes";
import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { SQL_UTC_NOW_EXPRESSION } from "@/lib/shared/debounced-update";
import type { ReminderSchedule } from "@/lib/reminders/schedule";

/**
 * Reminders are recurring task templates. Like Bookmarks/Quotes they are stored
 * in the notes backend as one feature-owned "system page" (kind "reminder")
 * whose blocks are the reminders — each a `type="reminder"` block whose
 * `content` is opaque JSON. No schema migration.
 *
 * A reminder never appears in the Tasks app directly; a client-side reconciler
 * (`materialize.ts`) turns it into a real Task N days before each occurrence.
 */

export const REMINDERS_KEY = "schedules";
export const REMINDER_BLOCK_TYPE = "reminder";

export type ReminderPriority = "low" | "medium" | "high" | "urgent";

export interface Reminder {
  id: string;
  title: string;
  link: string;
  tags: string[];
  priority: ReminderPriority;
  schedule: ReminderSchedule;
  daysBefore: number;
  active: boolean;
  /** Occurrence key (yyyy-MM-dd) of the last task created from this reminder. */
  lastMaterializedKey: string | null;
  /** Id of that task — used by the materializer's pending-gate. */
  lastTaskId: string | null;
  createdAt: string;
  sortRank: string;
}

/** Shape stored in `blocks.content` for a reminder block (no id/sortRank). */
export type ReminderContent = Omit<Reminder, "id" | "sortRank">;

const PRIORITIES: ReminderPriority[] = ["low", "medium", "high", "urgent"];
const DEFAULT_SCHEDULE: ReminderSchedule = { freq: "monthly", day: 1 };

/** A sensible starting schedule for a brand-new reminder: monthly on today's date. */
function defaultNewSchedule(): ReminderSchedule {
  return { freq: "monthly", day: new Date().getDate() };
}

/** Idempotently create the reminders page. Returns its id. */
export async function ensureRemindersPage(): Promise<string> {
  return ensureSystemPage({ kind: "reminder", key: REMINDERS_KEY, title: "Reminders" });
}

function isSchedule(value: unknown): value is ReminderSchedule {
  if (!value || typeof value !== "object") return false;
  const s = value as { freq?: unknown };
  switch (s.freq) {
    case "once":
      return typeof (value as { date?: unknown }).date === "string";
    case "weekly":
      return typeof (value as { weekday?: unknown }).weekday === "number";
    case "monthly":
      return typeof (value as { day?: unknown }).day === "number";
    case "yearly": {
      const v = value as { month?: unknown; day?: unknown };
      return typeof v.month === "number" && typeof v.day === "number";
    }
    default:
      return false;
  }
}

/** Parse a `blocks.content` string into reminder content, tolerating malformed rows. */
export function parseReminderContent(raw: string | null | undefined): ReminderContent {
  const fallback: ReminderContent = {
    title: "",
    link: "",
    tags: [],
    priority: "medium",
    schedule: DEFAULT_SCHEDULE,
    daysBefore: 0,
    active: true,
    lastMaterializedKey: null,
    lastTaskId: null,
    createdAt: "",
  };
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<ReminderContent>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      link: typeof parsed.link === "string" ? parsed.link : "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === "string") : [],
      priority: PRIORITIES.includes(parsed.priority as ReminderPriority) ? (parsed.priority as ReminderPriority) : "medium",
      schedule: isSchedule(parsed.schedule) ? parsed.schedule : DEFAULT_SCHEDULE,
      daysBefore: typeof parsed.daysBefore === "number" && parsed.daysBefore >= 0 ? Math.floor(parsed.daysBefore) : 0,
      active: parsed.active !== false,
      lastMaterializedKey: typeof parsed.lastMaterializedKey === "string" ? parsed.lastMaterializedKey : null,
      lastTaskId: typeof parsed.lastTaskId === "string" ? parsed.lastTaskId : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    };
  } catch {
    return fallback;
  }
}

export interface CreateReminderInput {
  title?: string;
  link?: string;
  tags?: string[];
  priority?: ReminderPriority;
  schedule?: ReminderSchedule;
  daysBefore?: number;
}

/**
 * Append a new reminder to the collection. Returns the new block id. All fields
 * default, so `createReminder()` makes a blank reminder to edit inline (the
 * reconciler skips it until it has a title).
 */
export async function createReminder(input: CreateReminderInput = {}): Promise<string> {
  const pageId = await ensureRemindersPage();
  const userId = await getCurrentUserId();
  const id = uuidv4();
  const now = new Date().toISOString();
  const sortRank = await nextSortRank(pageId);
  const content: ReminderContent = {
    title: input.title?.trim() ?? "",
    link: input.link?.trim() ?? "",
    tags: input.tags ?? [],
    priority: input.priority ?? "medium",
    schedule: input.schedule ?? defaultNewSchedule(),
    daysBefore: input.daysBefore != null ? Math.max(0, Math.floor(input.daysBefore)) : 3,
    active: true,
    lastMaterializedKey: null,
    lastTaskId: null,
    createdAt: now,
  };
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, REMINDER_BLOCK_TYPE, JSON.stringify(content), sortRank, now],
  );
  return id;
}

/** Overwrite a reminder's editable fields (materialization bookkeeping untouched). */
export async function updateReminder(
  id: string,
  patch: Partial<Pick<ReminderContent, "title" | "link" | "tags" | "priority" | "schedule" | "daysBefore">>,
): Promise<void> {
  const current = await readReminderContent(id);
  if (!current) return;
  await writeReminderContent(id, { ...current, ...patch });
}

/** Flip a reminder's active flag (pausing stops materialization). */
export async function toggleActive(id: string): Promise<void> {
  const current = await readReminderContent(id);
  if (!current) return;
  await writeReminderContent(id, { ...current, active: !current.active });
}

/**
 * Record that an occurrence was materialized into a task. For a one-off, also
 * deactivate — there are no further occurrences. Used only by the materializer.
 */
export async function markMaterialized(id: string, key: string, taskId: string): Promise<void> {
  const current = await readReminderContent(id);
  if (!current) return;
  await writeReminderContent(id, {
    ...current,
    lastMaterializedKey: key,
    lastTaskId: taskId,
    active: current.schedule.freq === "once" ? false : current.active,
  });
}

export async function deleteReminder(id: string): Promise<void> {
  await db.execute(`DELETE FROM blocks WHERE id = ?`, [id]);
  await deleteEntityEdges(id);
}

async function readReminderContent(id: string): Promise<ReminderContent | null> {
  const row = await db.getOptional<{ content: string | null }>(
    `SELECT content FROM blocks WHERE id = ? LIMIT 1`,
    [id],
  );
  return row ? parseReminderContent(row.content) : null;
}

async function writeReminderContent(id: string, content: ReminderContent): Promise<void> {
  await db.execute(
    `UPDATE blocks SET content = ?, updated_at = ${SQL_UTC_NOW_EXPRESSION} WHERE id = ?`,
    [JSON.stringify(content), id],
  );
}

/** A sort rank after the last existing reminder (or the middle if none). */
async function nextSortRank(pageId: string): Promise<string> {
  const last = await db.getOptional<{ sort_rank: string }>(
    `SELECT sort_rank FROM blocks WHERE page_id = ? AND type = ? ORDER BY sort_rank DESC LIMIT 1`,
    [pageId, REMINDER_BLOCK_TYPE],
  );
  if (!last?.sort_rank) return LexoRank.middle().format();
  try {
    return LexoRank.parse(last.sort_rank).genNext().format();
  } catch {
    return LexoRank.middle().format();
  }
}
