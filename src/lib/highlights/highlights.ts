import { ensureSystemPage, nextSortRank } from "@/lib/notes/notes";
import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { deleteEntityTags, setEntityTags } from "@/lib/tags/entity-tags";
import { localDateKey } from "@/lib/tracker/day-keys";
import { v4 as uuidv4 } from "uuid";

/**
 * A highlight is one-off waypoint in a year — a day worth remembering, kept out of
 * the daily log. (It is not the Events app: that tracks recurring things with an
 * occurrence history, which is why this feature is not called "events".)
 *
 * Highlights are stored in the notes backend as one feature-owned "system page"
 * whose blocks are the highlights — each a block of `HIGHLIGHT_BLOCK_TYPE`, whose
 * `content` is JSON `{ at, title, note, emoji }`.
 *
 * No cadence, no lead time, no occurrence history (that is the Events app), and not
 * a second journal (that is the day page). The collection stays small by nature —
 * single digits to a few dozen a year — which is why a cached load of the whole
 * registry is fine, and why this needs no schema change.
 *
 * Its tags are `entity_tags` rows, the same membership table tasks, bookmarks,
 * events and notes use. That is also where its colour comes from: a highlight
 * wears the colours of the tags it carries and has no colour of its own, so there
 * is no second palette to keep in step.
 *
 * `ensureSystemPage` seeds an empty `type="text"` starter block; it is ignored.
 */

export const HIGHLIGHTS_KEY = "year";

/**
 * The name a highlight's page, block and tag rows are stored under — one constant
 * read by the page, the block writer and the tag writer.
 */
export const HIGHLIGHT_STORED_KIND = "highlight";

export const HIGHLIGHT_BLOCK_TYPE = HIGHLIGHT_STORED_KIND;

/**
 * How many tags one highlight may carry. Two: a waypoint is a single line in the year,
 * not a filing cabinet — the pair is enough to place it (what kind of turning
 * point, which part of life) and keeps its row on the Day surface readable. The
 * write path clamps to it, so the rule holds for the data, not just the picker.
 */
export const MAX_HIGHLIGHT_TAGS = 2;

/** The tag ids a write should store: deduped and clamped to the limit. */
function cappedTagIds(tagIds: readonly string[]): string[] {
  return [...new Set(tagIds.filter(Boolean))].slice(0, MAX_HIGHLIGHT_TAGS);
}

/** Shape stored in `blocks.content` for a highlight's block. */
export interface HighlightContent {
  /** Local calendar day, `yyyy-MM-dd` — the day the highlight belongs to. */
  at: string;
  title: string;
  note: string;
  /** Fluent Emoji sprite name or a raw emoji; null when the highlight has none. */
  emoji: string | null;
}

export interface Highlight extends HighlightContent {
  id: string;
  sortRank: string;
  /** Tag ids from `entity_tags` — the event's colour and its only classification. */
  tagIds: string[];
}

/** One year's worth of events, newest year first when grouped. */
export interface HighlightYear {
  year: number;
  events: Highlight[];
}

/** Idempotently create the highlights registry page. Returns its id. */
export async function ensureHighlightRegistry(): Promise<string> {
  return ensureSystemPage({
    kind: HIGHLIGHT_STORED_KIND,
    key: HIGHLIGHTS_KEY,
    title: "Highlights",
  });
}

/**
 * Parse a `blocks.content` string into a highlight, tolerating malformed rows and
 * ones missing a field.
 */
export function parseHighlightContent(raw: string | null | undefined): HighlightContent {
  let parsed: Partial<HighlightContent> = {};
  try {
    parsed = JSON.parse(raw ?? "{}") as Partial<HighlightContent>;
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
 * The `yyyy-MM-dd` key a highlight sits on.
 *
 * Takes what a caller or a stored row is likely to hold — a calendar day already
 * formatted, or a real instant — and lands on the *local* day, because "18 Apr"
 * has to stay 18 Apr wherever it is read. `localDateKey` is the one place that
 * conversion lives; `day-keys.ts` explains why an instant would otherwise drift.
 */
export function highlightDayKey(value: Date | string | null | undefined): string {
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
export function groupByYear(events: Highlight[]): HighlightYear[] {
  const byYear = new Map<number, Highlight[]>();
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
export interface HighlightDaySummary {
  label: string;
  emoji: string | null;
  /** The first event's tags; the first of these colours the pin. */
  tagIds: string[];
  /** Every event the pin stands for; opening the pin edits the first. */
  eventIds: string[];
}

export function summarizeDayHighlights(events: readonly Highlight[]): HighlightDaySummary {
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
export function groupHighlightsForDays(
  events: readonly Highlight[],
  dayKeys: readonly string[],
): Map<string, Highlight[]> {
  const wanted = new Set(dayKeys);
  const byDay = new Map<string, Highlight[]>();
  for (const event of events) {
    if (!wanted.has(event.at)) continue;
    const bucket = byDay.get(event.at);
    if (bucket) bucket.push(event);
    else byDay.set(event.at, [event]);
  }
  return byDay;
}

/** Append a new highlight to the registry. Returns the new block id. */
export async function createHighlight(input: {
  at: Date | string;
  title: string;
  note?: string;
  emoji?: string | null;
  tagIds?: string[];
}): Promise<string> {
  const pageId = await ensureHighlightRegistry();
  const userId = await getCurrentUserId();
  const id = uuidv4();
  const now = new Date().toISOString();
  const sortRank = await nextSortRank(pageId, HIGHLIGHT_BLOCK_TYPE);
  const content: HighlightContent = {
    at: highlightDayKey(input.at),
    title: input.title.trim(),
    note: input.note?.trim() ?? "",
    emoji: input.emoji?.trim() ? input.emoji : null,
  };
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, HIGHLIGHT_BLOCK_TYPE, JSON.stringify(content), sortRank, now],
  );
  const tagIds = cappedTagIds(input.tagIds ?? []);
  if (tagIds.length) await setEntityTags(id, HIGHLIGHT_STORED_KIND, tagIds);
  return id;
}

/** Overwrite a highlight's editable fields, and its tags when given. */
export async function updateHighlight(
  id: string,
  patch: Partial<{ at: Date | string; title: string; note: string; emoji: string | null; tagIds: string[] }>,
): Promise<void> {
  const current = await readHighlightContent(id);
  if (!current) return;
  const next: HighlightContent = {
    ...current,
    ...(patch.at !== undefined ? { at: highlightDayKey(patch.at) } : {}),
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.note !== undefined ? { note: patch.note.trim() } : {}),
    ...(patch.emoji !== undefined ? { emoji: patch.emoji?.trim() ? patch.emoji : null } : {}),
  };
  await writeHighlightContent(id, next);
  if (patch.tagIds !== undefined) await setEntityTags(id, HIGHLIGHT_STORED_KIND, cappedTagIds(patch.tagIds));
}

export async function deleteHighlight(id: string): Promise<void> {
  await deleteEntityTags(id);
  await db.execute(`DELETE FROM blocks WHERE id = ?`, [id]);
}

/** Re-insert a deleted highlight with its original content and tags (the undo path). */
export async function restoreHighlight(
  id: string,
  content: HighlightContent,
  sortRank?: string,
  tagIds: string[] = [],
): Promise<void> {
  const pageId = await ensureHighlightRegistry();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, HIGHLIGHT_BLOCK_TYPE, JSON.stringify(content), sortRank ?? (await nextSortRank(pageId, HIGHLIGHT_BLOCK_TYPE)), now],
  );
  const restored = cappedTagIds(tagIds);
  if (restored.length) await setEntityTags(id, HIGHLIGHT_STORED_KIND, restored);
}

async function readHighlightContent(id: string): Promise<HighlightContent | null> {
  const row = await db.getOptional<{ content: string | null }>(
    `SELECT content FROM blocks WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!row) return null;
  return parseHighlightContent(row.content);
}

async function writeHighlightContent(id: string, content: HighlightContent): Promise<void> {
  await db.execute(
    `UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(content), new Date().toISOString(), id],
  );
}
