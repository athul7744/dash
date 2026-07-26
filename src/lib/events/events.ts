import { LexoRank } from "lexorank";
import { v4 as uuidv4 } from "uuid";

import { deleteEntityEdges } from "@/lib/links/links";
import { ensureSystemPage } from "@/lib/notes/notes";
import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { SQL_UTC_NOW_EXPRESSION } from "@/lib/shared/debounced-update";
import type { EventSchedule } from "@/lib/events/schedule";
import { REF_KIND_LABEL, type RefKind } from "@/lib/links/tokens";

const REF_KIND_SET = new Set<string>(Object.keys(REF_KIND_LABEL));

/**
 * The Events app tracks recurring "things" — each a `type="event"` block on one
 * feature-owned system page (kind "event"), like Bookmarks/Quotes. A thing may
 * carry an optional **schedule** (drives task materialization, `materialize.ts`)
 * and an **occurrence log** — `type="occurrence"` child blocks recording when it
 * actually happened (drives last-done / cadence / heatmap / overdue). No schema
 * migration: everything is opaque JSON in existing `blocks`.
 */

export const EVENTS_KEY = "log";
export const EVENT_BLOCK_TYPE = "event";
export const OCCURRENCE_BLOCK_TYPE = "occurrence";

/**
 * SQL expression for an occurrence's subject id — the entity it was logged
 * against. Lives in `content.subjectId`; `parent_block_id` stays NULL, since a
 * subject can be a note page / task id the blocks FK would reject. Use everywhere
 * occurrences are filtered/grouped.
 */
export const OCCURRENCE_SUBJECT_SQL = "json_extract(content, '$.subjectId')";

export type EventPriority = "low" | "medium" | "high" | "urgent";

export interface EventItem {
  id: string;
  title: string;
  link: string;
  tags: string[];
  priority: EventPriority;
  /** Optional expected cadence. `null` = log-only (no scheduling / materialization). */
  schedule: EventSchedule | null;
  daysBefore: number;
  /** Prefilled place for new occurrences (autocompletes from past places too). */
  defaultPlace: string;
  /** Optional external subject this event tracks — its logs land on that entity's
      timeline instead of the event's own. `null` = the event is its own subject. */
  subjectKind: RefKind | null;
  subjectId: string | null;
  active: boolean;
  /** Occurrence key (yyyy-MM-dd) of the last task created from this thing's schedule. */
  lastMaterializedKey: string | null;
  /** Id of that task — used by the materializer's pending-gate + completion-log. */
  lastTaskId: string | null;
  /** Occurrence key already logged from the scheduled loop (dedupes completion-log). */
  lastLoggedKey: string | null;
  createdAt: string;
  sortRank: string;
}

/** Shape stored in `blocks.content` for an event block (no id/sortRank). */
export type EventContent = Omit<EventItem, "id" | "sortRank">;

export type OccurrenceSource = "manual" | "task" | "schedule";

export interface Occurrence {
  id: string;
  /** Subject id — the entity this happened to. Mirror of `content.subjectId`. */
  thingId: string;
  /**
   * Subject id, stored in content. NOT `parent_block_id` — a subject can be a
   * note (page id) or task (task id), which the `blocks.parent_block_id → blocks.id`
   * FK would reject, so occurrences keep `parent_block_id` null and key off this.
   */
  subjectId: string;
  /** ISO UTC instant of when it happened. */
  at: string;
  /** What happened ("Repaired" / "Called"). Optional; free string with smart reuse. */
  action: string;
  place: string;
  note: string;
  source: OccurrenceSource;
  /** Kind of the subject entity — denormalized so rows render without a resolve. */
  subjectKind: RefKind;
}

export type OccurrenceContent = Omit<Occurrence, "id" | "thingId">;

const PRIORITIES: EventPriority[] = ["low", "medium", "high", "urgent"];
const SOURCES: OccurrenceSource[] = ["manual", "task", "schedule"];

/** Idempotently create the events page. Returns its id. */
export async function ensureEventsPage(): Promise<string> {
  return ensureSystemPage({ kind: "event", key: EVENTS_KEY, title: "Events" });
}

function isSchedule(value: unknown): value is EventSchedule {
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
    case "interval":
      return typeof (value as { days?: unknown }).days === "number";
    default:
      return false;
  }
}

/** Parse a `blocks.content` string into event content, tolerating malformed rows. */
export function parseEventContent(raw: string | null | undefined): EventContent {
  const fallback: EventContent = {
    title: "",
    link: "",
    tags: [],
    priority: "medium",
    schedule: null,
    daysBefore: 3,
    defaultPlace: "",
    subjectKind: null,
    subjectId: null,
    active: true,
    lastMaterializedKey: null,
    lastTaskId: null,
    lastLoggedKey: null,
    createdAt: "",
  };
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<EventContent>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      link: typeof parsed.link === "string" ? parsed.link : "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === "string") : [],
      priority: PRIORITIES.includes(parsed.priority as EventPriority) ? (parsed.priority as EventPriority) : "medium",
      schedule: isSchedule(parsed.schedule) ? parsed.schedule : null,
      daysBefore: typeof parsed.daysBefore === "number" && parsed.daysBefore >= 0 ? Math.floor(parsed.daysBefore) : 3,
      defaultPlace: typeof parsed.defaultPlace === "string" ? parsed.defaultPlace : "",
      subjectKind: typeof parsed.subjectKind === "string" && REF_KIND_SET.has(parsed.subjectKind) ? (parsed.subjectKind as RefKind) : null,
      subjectId: typeof parsed.subjectId === "string" && parsed.subjectId ? parsed.subjectId : null,
      active: parsed.active !== false,
      lastMaterializedKey: typeof parsed.lastMaterializedKey === "string" ? parsed.lastMaterializedKey : null,
      lastTaskId: typeof parsed.lastTaskId === "string" ? parsed.lastTaskId : null,
      lastLoggedKey: typeof parsed.lastLoggedKey === "string" ? parsed.lastLoggedKey : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    };
  } catch {
    return fallback;
  }
}

/** Parse a `blocks.content` string into occurrence content, tolerating malformed rows. */
export function parseOccurrenceContent(raw: string | null | undefined): OccurrenceContent {
  const fallback: OccurrenceContent = { at: "", action: "", place: "", note: "", source: "manual", subjectKind: "event", subjectId: "" };
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<OccurrenceContent>;
    return {
      at: typeof parsed.at === "string" ? parsed.at : "",
      action: typeof parsed.action === "string" ? parsed.action : "",
      place: typeof parsed.place === "string" ? parsed.place : "",
      note: typeof parsed.note === "string" ? parsed.note : "",
      source: SOURCES.includes(parsed.source as OccurrenceSource) ? (parsed.source as OccurrenceSource) : "manual",
      subjectKind: typeof parsed.subjectKind === "string" && REF_KIND_SET.has(parsed.subjectKind) ? (parsed.subjectKind as RefKind) : "event",
      subjectId: typeof parsed.subjectId === "string" ? parsed.subjectId : "",
    };
  } catch {
    return fallback;
  }
}

export interface CreateEventInput {
  /** Pre-generated block id — lets the caller navigate to the new event before
      this write lands, so no empty card flashes in the list first. */
  id?: string;
  title?: string;
  link?: string;
  tags?: string[];
  priority?: EventPriority;
  schedule?: EventSchedule | null;
  daysBefore?: number;
  defaultPlace?: string;
}

/**
 * Append a new recurring thing. Returns its block id. Everything defaults, so
 * `createEvent()` makes a blank, log-only thing to edit inline (no schedule until
 * the user adds one; the materializer skips it while it has no title/schedule).
 */
export async function createEvent(input: CreateEventInput = {}): Promise<string> {
  const pageId = await ensureEventsPage();
  const userId = await getCurrentUserId();
  const id = input.id ?? uuidv4();
  const now = new Date().toISOString();
  const sortRank = await nextSortRank(pageId, EVENT_BLOCK_TYPE);
  const content: EventContent = {
    title: input.title?.trim() ?? "",
    link: input.link?.trim() ?? "",
    tags: input.tags ?? [],
    priority: input.priority ?? "medium",
    schedule: input.schedule ?? null,
    daysBefore: input.daysBefore != null ? Math.max(0, Math.floor(input.daysBefore)) : 3,
    defaultPlace: input.defaultPlace?.trim() ?? "",
    subjectKind: null,
    subjectId: null,
    active: true,
    lastMaterializedKey: null,
    lastTaskId: null,
    lastLoggedKey: null,
    createdAt: now,
  };
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, EVENT_BLOCK_TYPE, JSON.stringify(content), sortRank, now],
  );
  return id;
}

/** Overwrite a thing's editable fields (materialization bookkeeping untouched). */
export async function updateEvent(
  id: string,
  patch: Partial<Pick<EventContent, "title" | "link" | "tags" | "priority" | "schedule" | "daysBefore" | "defaultPlace" | "subjectKind" | "subjectId">>,
): Promise<void> {
  const current = await readEventContent(id);
  if (!current) return;
  await writeEventContent(id, { ...current, ...patch });
}

/** Flip a thing's active flag (pausing stops materialization). */
export async function toggleActive(id: string): Promise<void> {
  const current = await readEventContent(id);
  if (!current) return;
  await writeEventContent(id, { ...current, active: !current.active });
}

/**
 * Record that an occurrence was materialized into a task. For a one-off, also
 * deactivate. Used only by the materializer.
 */
export async function markMaterialized(id: string, key: string, taskId: string): Promise<void> {
  const current = await readEventContent(id);
  if (!current) return;
  await writeEventContent(id, {
    ...current,
    lastMaterializedKey: key,
    lastTaskId: taskId,
    active: current.schedule?.freq === "once" ? false : current.active,
  });
}

/** Mark that the scheduled loop has logged an occurrence for `key` (dedupe gate). */
export async function markLogged(id: string, key: string): Promise<void> {
  const current = await readEventContent(id);
  if (!current) return;
  await writeEventContent(id, { ...current, lastLoggedKey: key });
}

export async function deleteEvent(id: string): Promise<void> {
  await db.execute(`DELETE FROM blocks WHERE id = ? OR (type = ? AND ${OCCURRENCE_SUBJECT_SQL} = ?)`, [id, OCCURRENCE_BLOCK_TYPE, id]);
  await deleteEntityEdges(id);
}

// ─── Occurrences ─────────────────────────────────────────────────────────────

export interface LogOccurrenceInput {
  at?: string | Date;
  action?: string;
  place?: string;
  note?: string;
  source?: OccurrenceSource;
  /** Kind of the subject entity (defaults to "event" — a standalone tracked thing). */
  subjectKind?: RefKind;
}

/** Record that a thing happened. Returns the occurrence block id. */
export async function logOccurrence(thingId: string, input: LogOccurrenceInput = {}): Promise<string> {
  const pageId = await ensureEventsPage();
  const userId = await getCurrentUserId();
  const id = uuidv4();
  const nowIso = new Date().toISOString();
  const at = input.at ? (input.at instanceof Date ? input.at.toISOString() : input.at) : nowIso;
  const sortRank = await nextSortRank(pageId, OCCURRENCE_BLOCK_TYPE);
  const content: OccurrenceContent = {
    at,
    action: input.action?.trim() ?? "",
    place: input.place?.trim() ?? "",
    note: input.note?.trim() ?? "",
    source: input.source ?? "manual",
    subjectKind: input.subjectKind ?? "event",
    subjectId: thingId,
  };
  // parent_block_id stays NULL: the subject may be a note/task (not a block), so
  // the blocks_parent_block_id_fkey would reject it. Subject lives in content.
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, OCCURRENCE_BLOCK_TYPE, JSON.stringify(content), sortRank, nowIso],
  );
  return id;
}

export async function updateOccurrence(id: string, patch: Partial<OccurrenceContent>): Promise<void> {
  const row = await db.getOptional<{ content: string | null }>(`SELECT content FROM blocks WHERE id = ? LIMIT 1`, [id]);
  if (!row) return;
  const next = { ...parseOccurrenceContent(row.content), ...patch };
  await db.execute(`UPDATE blocks SET content = ?, updated_at = ${SQL_UTC_NOW_EXPRESSION} WHERE id = ?`, [
    JSON.stringify(next),
    id,
  ]);
}

export async function deleteOccurrence(id: string): Promise<void> {
  await db.execute(`DELETE FROM blocks WHERE id = ?`, [id]);
}

/**
 * Delete every occurrence logged against a subject entity. Call from each app's
 * delete path (note/bookmark/task/quote) so a deleted subject leaves no orphan
 * occurrences — there is no shared cross-app delete chokepoint. Events already
 * cascade their own occurrences via `deleteEvent`.
 */
export async function deleteSubjectOccurrences(subjectId: string): Promise<void> {
  await db.execute(`DELETE FROM blocks WHERE type = ? AND ${OCCURRENCE_SUBJECT_SQL} = ?`, [OCCURRENCE_BLOCK_TYPE, subjectId]);
}

// ─── Stats (pure) ──────────────────────────────────────────────────────────

export interface ThingStatsInput {
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Explicit expected interval (an `interval` schedule's `days`), else null. */
  cadenceDays: number | null;
}

export interface ThingStats {
  count: number;
  lastAt: string | null;
  daysSinceLast: number | null;
  /** Derived average gap between occurrences, in days. */
  avgGapDays: number | null;
  /** Explicit cadence if set, else the derived average gap. */
  expectedGapDays: number | null;
  overdue: boolean;
  nextDueAt: string | null;
}

const MS_PER_DAY = 86_400_000;

/** Derive last-done / cadence / overdue from occurrence aggregates. Pure. */
export function computeThingStats(input: ThingStatsInput, now: Date = new Date()): ThingStats {
  const { count, firstAt, lastAt, cadenceDays } = input;
  const lastMs = lastAt ? Date.parse(lastAt) : NaN;
  const firstMs = firstAt ? Date.parse(firstAt) : NaN;
  const daysSinceLast = Number.isNaN(lastMs) ? null : (now.getTime() - lastMs) / MS_PER_DAY;
  const avgGapDays = count >= 2 && !Number.isNaN(firstMs) && !Number.isNaN(lastMs) ? (lastMs - firstMs) / (count - 1) / MS_PER_DAY : null;
  const expectedGapDays = cadenceDays ?? avgGapDays;
  const overdue = expectedGapDays != null && daysSinceLast != null && daysSinceLast > expectedGapDays * 1.15;
  const nextDueAt = !Number.isNaN(lastMs) && expectedGapDays != null ? new Date(lastMs + expectedGapDays * MS_PER_DAY).toISOString() : null;
  return { count, lastAt, daysSinceLast, avgGapDays, expectedGapDays, overdue, nextDueAt };
}

/**
 * Fold a per-thing occurrence aggregate (or `undefined` when it has none) into
 * stats, applying the empty defaults in one place. `cadenceDays` = an explicit
 * interval, else null (a derived gap is used). Pure.
 */
export function statsFromAggregate(
  agg: { count: number; firstAt: string | null; lastAt: string | null } | undefined,
  cadenceDays: number | null,
  now: Date = new Date(),
): ThingStats {
  return computeThingStats({ count: agg?.count ?? 0, firstAt: agg?.firstAt ?? null, lastAt: agg?.lastAt ?? null, cadenceDays }, now);
}

/** Compact human duration for a day count (cadence / gaps). Pure. */
export function formatDays(days: number): string {
  const rounded = Math.round(days);
  if (rounded < 1) return "1d";
  if (rounded < 14) return `${rounded}d`;
  if (rounded < 60) return `${Math.round(days / 7)}w`;
  if (rounded < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

// ─── internals ───────────────────────────────────────────────────────────────

async function readEventContent(id: string): Promise<EventContent | null> {
  const row = await db.getOptional<{ content: string | null }>(`SELECT content FROM blocks WHERE id = ? LIMIT 1`, [id]);
  return row ? parseEventContent(row.content) : null;
}

async function writeEventContent(id: string, content: EventContent): Promise<void> {
  await db.execute(`UPDATE blocks SET content = ?, updated_at = ${SQL_UTC_NOW_EXPRESSION} WHERE id = ?`, [
    JSON.stringify(content),
    id,
  ]);
}

/** A sort rank after the last existing block of `type` on the page (or middle if none). */
async function nextSortRank(pageId: string, type: string): Promise<string> {
  const last = await db.getOptional<{ sort_rank: string }>(
    `SELECT sort_rank FROM blocks WHERE page_id = ? AND type = ? ORDER BY sort_rank DESC LIMIT 1`,
    [pageId, type],
  );
  if (!last?.sort_rank) return LexoRank.middle().format();
  try {
    return LexoRank.parse(last.sort_rank).genNext().format();
  } catch {
    return LexoRank.middle().format();
  }
}
