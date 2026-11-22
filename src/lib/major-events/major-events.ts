import { ensureSystemPage, nextSortRank } from "@/lib/notes/notes";
import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { deleteEntityTags, setEntityTags } from "@/lib/tags/entity-tags";
import { localDateKey } from "@/lib/tracker/day-keys";
import { v4 as uuidv4 } from "uuid";

/**
 * Major events are stored in the notes backend as one feature-owned "system page"
 * (kind "major-event") whose blocks are the events — each a `type="major-event"`
 * block whose `content` is JSON `{ at, title, note, emoji }`.
 *
 * A major event is a one-off waypoint in the year, not a tracked thing: no
 * cadence, no lead time, no occurrence history (that is the Events app), and not
 * a second journal (that is the day page). The collection stays small by nature —
 * single digits to a few dozen a year — which is why a cached load of the whole
 * registry is fine, and why this needs no schema change.
 *
 * Its tags are `entity_tags` rows (`entity_kind = "major-event"`), the same
 * membership table tasks, bookmarks, events and notes use. That is also where its
 * colour comes from: a waypoint wears the colours of the tags it carries and has
 * no colour of its own, so there is no second palette to keep in step.
 *
 * `ensureSystemPage` seeds an empty `type="text"` starter block; it is ignored.
 */

export const MAJOR_EVENTS_KEY = "year";
export const MAJOR_EVENT_BLOCK_TYPE = "major-event";

/**
 * How many tags one event may carry. Two: a waypoint is a single line in the year,
 * not a filing cabinet — the pair is enough to place it (what kind of turning
 * point, which part of life) and keeps its row on the Day surface readable. The
 * write path clamps to it, so the rule holds for the data, not just the picker.
 */
export const MAX_MAJOR_EVENT_TAGS = 2;

/** The tag ids a write should store: deduped and clamped to the limit. */
function cappedTagIds(tagIds: readonly string[]): string[] {
  return [...new Set(tagIds.filter(Boolean))].slice(0, MAX_MAJOR_EVENT_TAGS);
}

/** Shape stored in `blocks.content` for a major-event block. */
export interface MajorEventContent {
  /** Local calendar day, `yyyy-MM-dd` — the day the event belongs to. */
  at: string;
  title: string;
  note: string;
  /** Fluent Emoji sprite name or a raw emoji; null when the event has none. */
  emoji: string | null;
}

export interface MajorEvent extends MajorEventContent {
  id: string;
  sortRank: string;
  /** Tag ids from `entity_tags` — the event's colour and its only classification. */
  tagIds: string[];
}

/** One year's worth of events, newest year first when grouped. */
export interface MajorEventYear {
  year: number;
  events: MajorEvent[];
}

/** Idempotently create the major-events registry page. Returns its id. */
export async function ensureMajorEventRegistry(): Promise<string> {
  return ensureSystemPage({
    kind: "major-event",
    key: MAJOR_EVENTS_KEY,
    title: "Major events",
  });
}

/**
 * Parse a `blocks.content` string into a major event, tolerating malformed rows
 * and older ones written before a field existed — including a `color` from when
 * an event carried its own; it is ignored, not migrated, because nothing reads it.
 */
export function parseMajorEventContent(raw: string | null | undefined): MajorEventContent {
  let parsed: Partial<MajorEventContent> = {};
  try {
    parsed = JSON.parse(raw ?? "{}") as Partial<MajorEventContent>;
  } catch {
    parsed = {};
  }

  const title = typeof parsed.title === "string" ? parsed.title : "";
  const at = normalizeDayKey(parsed.at);
  return {
    // A row with no readable date can't be placed in a year, so it sorts nowhere
    // rather than showing up on today.
    at,
    title,
    note: typeof parsed.note === "string" ? parsed.note : "",
    emoji: typeof parsed.emoji === "string" && parsed.emoji.trim() ? parsed.emoji : null,
  };
}

/**
 * The `yyyy-MM-dd` key a major event sits on.
 *
 * Takes what a caller or a stored row is likely to hold — a calendar day already
 * formatted, or a real instant — and lands on the *local* day, because "18 Apr"
 * has to stay 18 Apr wherever it is read. `localDateKey` is the one place that
 * conversion lives; `day-keys.ts` explains why an instant would otherwise drift.
 */
export function majorEventDayKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : localDateKey(value);
  return normalizeDayKey(value);
}

function normalizeDayKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const day = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  // An ISO instant stored by an older writer still resolves, via the same
  // local-day rule everything else uses.
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? "" : localDateKey(parsed);
}

/** Events grouped by year, newest year first and oldest day first within a year. */
export function groupByYear(events: MajorEvent[]): MajorEventYear[] {
  const byYear = new Map<number, MajorEvent[]>();
  for (const event of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.at)) continue;
    const year = Number(event.at.slice(0, 4));
    const bucket = byYear.get(year);
    if (bucket) bucket.push(event);
    else byYear.set(year, [event]);
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, list]) => ({
      year,
      events: list.sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title)),
    }));
}

/**
 * How one day's events read as a single pin: their titles joined, and the first
 * event lending its icon and its tags (whose colours the pin's dot wears). Shared
 * by both year views so a day with two events looks the same in the mood grid as
 * in the activity grid.
 */
export interface MajorEventDaySummary {
  label: string;
  emoji: string | null;
  /** The first event's tags; the first of these colours the pin. */
  tagIds: string[];
  /** Every event the pin stands for; opening the pin edits the first. */
  eventIds: string[];
}

export function summarizeDayEvents(events: readonly MajorEvent[]): MajorEventDaySummary {
  const [first] = events;
  return {
    label: events.map((event) => event.title).join(" · "),
    emoji: first?.emoji ?? null,
    tagIds: first?.tagIds ?? [],
    eventIds: events.map((event) => event.id),
  };
}

/**
 * The events on each of the given days, keyed by `yyyy-MM-dd` — for a strip or a
 * diary that renders a fixed set of days rather than a year. Days with nothing are
 * absent from the map.
 */
export function groupEventsForDays(
  events: readonly MajorEvent[],
  dayKeys: readonly string[],
): Map<string, MajorEvent[]> {
  const wanted = new Set(dayKeys);
  const byDay = new Map<string, MajorEvent[]>();
  for (const event of events) {
    if (!wanted.has(event.at)) continue;
    const bucket = byDay.get(event.at);
    if (bucket) bucket.push(event);
    else byDay.set(event.at, [event]);
  }
  return byDay;
}

/** Append a new major event to the registry. Returns the new block id. */
export async function createMajorEvent(input: {
  at: Date | string;
  title: string;
  note?: string;
  emoji?: string | null;
  tagIds?: string[];
}): Promise<string> {
  const pageId = await ensureMajorEventRegistry();
  const userId = await getCurrentUserId();
  const id = uuidv4();
  const now = new Date().toISOString();
  const sortRank = await nextSortRank(pageId, MAJOR_EVENT_BLOCK_TYPE);
  const content: MajorEventContent = {
    at: majorEventDayKey(input.at),
    title: input.title.trim(),
    note: input.note?.trim() ?? "",
    emoji: input.emoji?.trim() ? input.emoji : null,
  };
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, MAJOR_EVENT_BLOCK_TYPE, JSON.stringify(content), sortRank, now],
  );
  const tagIds = cappedTagIds(input.tagIds ?? []);
  if (tagIds.length) await setEntityTags(id, "major-event", tagIds);
  return id;
}

/** Overwrite a major event's editable fields, and its tags when given. */
export async function updateMajorEvent(
  id: string,
  patch: Partial<{ at: Date | string; title: string; note: string; emoji: string | null; tagIds: string[] }>,
): Promise<void> {
  const current = await readMajorEventContent(id);
  if (!current) return;
  const next: MajorEventContent = {
    ...current,
    ...(patch.at !== undefined ? { at: majorEventDayKey(patch.at) } : {}),
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.note !== undefined ? { note: patch.note.trim() } : {}),
    ...(patch.emoji !== undefined ? { emoji: patch.emoji?.trim() ? patch.emoji : null } : {}),
  };
  await writeMajorEventContent(id, next);
  if (patch.tagIds !== undefined) await setEntityTags(id, "major-event", cappedTagIds(patch.tagIds));
}

export async function deleteMajorEvent(id: string): Promise<void> {
  await deleteEntityTags(id);
  await db.execute(`DELETE FROM blocks WHERE id = ?`, [id]);
}

/** Re-insert a deleted event with its original content and tags (the undo path). */
export async function restoreMajorEvent(
  id: string,
  content: MajorEventContent,
  sortRank?: string,
  tagIds: string[] = [],
): Promise<void> {
  const pageId = await ensureMajorEventRegistry();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, MAJOR_EVENT_BLOCK_TYPE, JSON.stringify(content), sortRank ?? (await nextSortRank(pageId, MAJOR_EVENT_BLOCK_TYPE)), now],
  );
  const restored = cappedTagIds(tagIds);
  if (restored.length) await setEntityTags(id, "major-event", restored);
}

async function readMajorEventContent(id: string): Promise<MajorEventContent | null> {
  const row = await db.getOptional<{ content: string | null }>(
    `SELECT content FROM blocks WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!row) return null;
  return parseMajorEventContent(row.content);
}

async function writeMajorEventContent(id: string, content: MajorEventContent): Promise<void> {
  await db.execute(
    `UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(content), new Date().toISOString(), id],
  );
}
