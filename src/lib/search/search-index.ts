/**
 * The local FTS5 search index — a disposable cache built from the synced tables.
 *
 * It is never synced and never a source of truth: `resetLocalDatabase` or a
 * browser eviction wipes it and it rebuilds. Every path tolerates it being empty
 * or missing. One row per navigable entity (note page, task, bookmark, quote,
 * event). A single `db.onChange` reconciler is the sole maintainer — no per-write
 * hooks — so inserts/updates/deletes from local edits *and* remote sync all land.
 *
 * Note pages are special: their body lives in nested ProseMirror JSON across many
 * blocks, so we derive it in JS (`deriveNotePage`). Because every note edit bumps
 * the page's `updated_at` (see `touchNotePage` / the persister's `onPersisted`),
 * a page-level watermark catches block adds, edits, and deletes alike.
 */

import { db } from "@/lib/powersync/db";
import { logger as log } from "@/lib/shared/logger";
import {
  deriveBlockEntity,
  deriveNotePage,
  deriveOccurrence,
  deriveTask,
  type BlockEntityKind,
  type OccurrenceDoc,
  type SearchDoc,
} from "./derive-text";

// v2: split occurrence blocks out of the main index into occurrence_index.
const SCHEMA_VERSION = 2;
const RECONCILE_DEBOUNCE_MS = 750;
const NOTE_BATCH = 100;
// Keep the "building" state on screen at least this long so a fast build still
// paints a visible sweep instead of the emits coalescing into one "ready" frame.
const MIN_BUILDING_MS = 1200;

/** Minimal executor shape shared by `db` and a write transaction. */
type Executor = { execute: (sql: string, params?: unknown[]) => Promise<unknown> };

// --- Public progress store (framework-agnostic; React subscribes via a hook) ---

export type SearchIndexStatus = "idle" | "building" | "ready" | "unavailable";
export type SearchIndexSnapshot = { status: SearchIndexStatus; done: number; total: number };

const IDLE: SearchIndexSnapshot = { status: "idle", done: 0, total: 0 };
let snapshot: SearchIndexSnapshot = IDLE;
const listeners = new Set<() => void>();

export function subscribeSearchIndex(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getSearchIndexSnapshot(): SearchIndexSnapshot {
  return snapshot;
}
export function getSearchIndexServerSnapshot(): SearchIndexSnapshot {
  return IDLE;
}
function emit(next: Partial<SearchIndexSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (merged.status === snapshot.status && merged.done === snapshot.done && merged.total === snapshot.total) return;
  snapshot = merged;
  listeners.forEach((l) => l());
}

// --- Engine state ---

let available = false;
let backfillDone = false;
let reconcilerStarted = false;

/** True once the index is built and usable; the query layer falls back to JS otherwise. */
export function isSearchIndexReady(): boolean {
  return available && backfillDone;
}

// Serialize every writer (backfill + reconcile) so two runs never interleave.
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.catch(() => {}).then(fn);
  chain = next.catch(() => {});
  return next as Promise<T>;
}

// --- SQL fragments ---

const NOTE_PAGE_FILTER = "json_extract(properties, '$.kind') IS NULL AND deleted_at IS NULL";
// Top-level tasks only — subtasks aren't independently navigable and would leave
// dangling hits in surfaces that list only parent tasks.
const TASK_FILTER = "state != 'trashed' AND parent_id IS NULL";
// bookmark/quote/event *entities*. On the events page only `type='event'` blocks
// are entities — `type='occurrence'` blocks are logged instances (indexed
// separately in occurrence_index), so exclude them here.
const SYS_BLOCK_JOIN =
  "blocks b JOIN pages p ON p.id = b.page_id WHERE b.deleted_at IS NULL AND json_extract(p.properties, '$.kind') IN ('bookmark','quote','event') AND (json_extract(p.properties, '$.kind') != 'event' OR b.type = 'event')";
// Logged occurrences: `type='occurrence'` blocks on the events system page.
const OCC_JOIN =
  "blocks b JOIN pages p ON p.id = b.page_id WHERE b.deleted_at IS NULL AND json_extract(p.properties, '$.kind') = 'event' AND b.type = 'occurrence'";

type TaskRow = { id: string; title: string | null; link: string | null };
type BlockRow = { id: string; content: string | null; kind: BlockEntityKind };
type PageRow = { id: string; title: string | null };

/** Space-joined tag names per entity, resolved from entity_tags → tags. Fed into
 * the derive functions so aux is searchable by tag name. */
async function tagNamesByEntity(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await db.getAll<{ entity_id: string; name: string | null }>(
    `SELECT et.entity_id AS entity_id, t.name AS name
     FROM entity_tags et JOIN tags t ON t.id = et.tag_id
     WHERE et.entity_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  for (const r of rows) {
    if (!r.entity_id || !r.name) continue;
    const cur = map.get(r.entity_id);
    map.set(r.entity_id, cur ? `${cur} ${r.name}` : r.name);
  }
  return map;
}

async function getMeta(key: string): Promise<string | null> {
  const row = await db.getOptional<{ value: string }>("SELECT value FROM search_meta WHERE key = ?", [key]);
  return row?.value ?? null;
}
async function setMeta(ctx: Executor, key: string, value: string): Promise<void> {
  await ctx.execute(
    "INSERT INTO search_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await db.getOptional<{ n: number }>(sql, params);
  return row?.n ?? 0;
}
async function maxUpdatedAt(): Promise<string> {
  const row = await db.getOptional<{ w: string | null }>(
    `SELECT max(mx) AS w FROM (
       SELECT max(updated_at) AS mx FROM tasks
       UNION ALL SELECT max(updated_at) FROM blocks
       UNION ALL SELECT max(updated_at) FROM pages
     )`,
  );
  return row?.w ?? "";
}

async function upsertDocs(ctx: Executor, docs: SearchDoc[]): Promise<void> {
  for (const d of docs) {
    // fts5 has no UPSERT — delete the prior row (entity_id is a stored column) then insert.
    await ctx.execute("DELETE FROM search_index WHERE entity_id = ?", [d.id]);
    await ctx.execute(
      "INSERT INTO search_index (kind, entity_id, title, body, aux) VALUES (?, ?, ?, ?, ?)",
      [d.kind, d.id, d.title, d.body, d.aux],
    );
  }
}

async function upsertOccurrences(ctx: Executor, docs: OccurrenceDoc[]): Promise<void> {
  for (const d of docs) {
    await ctx.execute("DELETE FROM occurrence_index WHERE occ_id = ?", [d.occId]);
    await ctx.execute(
      "INSERT INTO occurrence_index (occ_id, thing_id, thing_kind, at, action, place, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [d.occId, d.thingId, d.thingKind, d.at, d.action, d.place, d.note],
    );
  }
}

/** Drop index rows whose source entity no longer exists — the only delete path. */
async function pruneOrphans(ctx: Executor): Promise<void> {
  await ctx.execute(`DELETE FROM search_index WHERE kind = 'task' AND entity_id NOT IN (SELECT id FROM tasks WHERE ${TASK_FILTER})`);
  await ctx.execute(`DELETE FROM search_index WHERE kind = 'note' AND entity_id NOT IN (SELECT id FROM pages WHERE ${NOTE_PAGE_FILTER})`);
  await ctx.execute(`DELETE FROM search_index WHERE kind IN ('bookmark','quote','event') AND entity_id NOT IN (SELECT b.id FROM ${SYS_BLOCK_JOIN})`);
  await ctx.execute(`DELETE FROM occurrence_index WHERE occ_id NOT IN (SELECT b.id FROM ${OCC_JOIN})`);
}

async function noteBlockContents(pageId: string): Promise<Array<string | null>> {
  const rows = await db.getAll<{ content: string | null }>(
    "SELECT content FROM blocks WHERE page_id = ? ORDER BY sort_rank",
    [pageId],
  );
  return rows.map((r) => r.content);
}

// --- DDL + probe ---

async function createTables(): Promise<void> {
  await db.execute(
    `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
       kind UNINDEXED, entity_id UNINDEXED, title, body, aux,
       tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'
     )`,
  );
  await db.execute(
    `CREATE VIRTUAL TABLE IF NOT EXISTS occurrence_index USING fts5(
       occ_id UNINDEXED, thing_id UNINDEXED, thing_kind UNINDEXED, at UNINDEXED,
       action, place, note,
       tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'
     )`,
  );
  await db.execute("CREATE TABLE IF NOT EXISTS search_meta (key TEXT PRIMARY KEY, value TEXT)");
}

/**
 * Probe FTS5, create the tables, and read prior build state. Safe to call on
 * every local open (idempotent). Sets `available`/`backfillDone` and seeds the
 * progress snapshot. Never throws — a missing FTS5 just leaves search on the JS
 * fallback.
 */
export async function ensureSearchIndex(): Promise<void> {
  try {
    await db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS _fts_probe USING fts5(x)");
    await db.execute("DROP TABLE IF EXISTS _fts_probe");
  } catch (err) {
    available = false;
    backfillDone = false;
    emit({ status: "unavailable" });
    log.warn("FTS5 unavailable — search falls back to in-memory matching", err);
    return;
  }

  available = true;
  await createTables();

  const version = await getMeta("schema_version");
  if (version !== String(SCHEMA_VERSION)) {
    // Fresh or stale schema — clear and force a rebuild.
    await db.execute("DELETE FROM search_index");
    await db.execute("DELETE FROM occurrence_index");
    await db.writeTransaction(async (tx) => {
      await setMeta(tx, "backfill_done", "0");
      await setMeta(tx, "backfill_cursor", "0");
    });
    backfillDone = false;
  } else {
    backfillDone = (await getMeta("backfill_done")) === "1";
  }
  emit({ status: backfillDone ? "ready" : "idle" });
}

// --- Incremental reconcile (watermark-based) ---

async function reconcileNow(): Promise<void> {
  if (!available || !backfillDone) return;
  const w = (await getMeta("watermark")) ?? "";

  const tasks = await db.getAll<TaskRow>(
    `SELECT id, title, link FROM tasks WHERE ${TASK_FILTER} AND updated_at > ?`,
    [w],
  );
  const blocks = await db.getAll<BlockRow>(
    `SELECT b.id AS id, b.content AS content, json_extract(p.properties, '$.kind') AS kind
     FROM blocks b JOIN pages p ON p.id = b.page_id
     WHERE b.updated_at > ? AND b.deleted_at IS NULL AND json_extract(p.properties, '$.kind') IN ('bookmark','quote','event')
       AND (json_extract(p.properties, '$.kind') != 'event' OR b.type = 'event')`,
    [w],
  );
  const pages = await db.getAll<PageRow>(
    `SELECT id, title FROM pages WHERE updated_at > ? AND ${NOTE_PAGE_FILTER}`,
    [w],
  );
  const occ = await db.getAll<{ id: string; content: string | null }>(
    `SELECT b.id AS id, b.content AS content FROM ${OCC_JOIN} AND b.updated_at > ?`,
    [w],
  );

  const tagNames = await tagNamesByEntity([...tasks, ...blocks, ...pages].map((r) => r.id));
  const docs: SearchDoc[] = [
    ...tasks.map((t) => deriveTask(t, tagNames.get(t.id) ?? "")),
    ...blocks.map((b) => deriveBlockEntity(b.kind, b, tagNames.get(b.id) ?? "")),
  ];
  for (const p of pages) docs.push(deriveNotePage(p, await noteBlockContents(p.id), tagNames.get(p.id) ?? ""));

  const newW = await maxUpdatedAt();
  await db.writeTransaction(async (tx) => {
    await upsertDocs(tx, docs);
    await upsertOccurrences(tx, occ.map(deriveOccurrence));
    await pruneOrphans(tx);
    await setMeta(tx, "watermark", newW || w);
  });
}

// --- Full backfill (first build; batched, resumable, progress-reporting) ---

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function backfill(): Promise<void> {
  if (!available) return;
  emit({ status: "building", done: 0, total: 0 });
  const buildingStartedAt = Date.now();
  try {
    const startW = await maxUpdatedAt();
    const totalNotes = await count(`SELECT count(*) AS n FROM pages WHERE ${NOTE_PAGE_FILTER}`);
    const totalTasks = await count(`SELECT count(*) AS n FROM tasks WHERE ${TASK_FILTER}`);
    const totalBlocks = await count(`SELECT count(*) AS n FROM ${SYS_BLOCK_JOIN}`);
    const totalOcc = await count(`SELECT count(*) AS n FROM ${OCC_JOIN}`);
    const total = totalNotes + totalTasks + totalBlocks + totalOcc;
    let done = 0;
    emit({ status: "building", done, total });

    // Tasks + system blocks are light — one query, one write each.
    const tasks = await db.getAll<TaskRow>(`SELECT id, title, link FROM tasks WHERE ${TASK_FILTER}`);
    const taskTags = await tagNamesByEntity(tasks.map((t) => t.id));
    await db.writeTransaction((tx) => upsertDocs(tx, tasks.map((t) => deriveTask(t, taskTags.get(t.id) ?? ""))));
    done += tasks.length;
    emit({ done });

    const blocks = await db.getAll<BlockRow>(
      `SELECT b.id AS id, b.content AS content, json_extract(p.properties, '$.kind') AS kind FROM ${SYS_BLOCK_JOIN}`,
    );
    const blockTags = await tagNamesByEntity(blocks.map((b) => b.id));
    await db.writeTransaction((tx) => upsertDocs(tx, blocks.map((b) => deriveBlockEntity(b.kind, b, blockTags.get(b.id) ?? ""))));
    done += blocks.length;
    emit({ done });

    // Notes are heavy (per-page block aggregation) — paginate + persist a cursor
    // so a mobile background/kill mid-build resumes instead of restarting.
    let offset = parseInt((await getMeta("backfill_cursor")) ?? "0", 10) || 0;
    done += Math.min(offset, totalNotes);
    emit({ done });
    for (;;) {
      const pageRows = await db.getAll<PageRow>(
        `SELECT id, title FROM pages WHERE ${NOTE_PAGE_FILTER} ORDER BY id LIMIT ? OFFSET ?`,
        [NOTE_BATCH, offset],
      );
      if (pageRows.length === 0) break;
      const pageTags = await tagNamesByEntity(pageRows.map((p) => p.id));
      const docs: SearchDoc[] = [];
      for (const p of pageRows) docs.push(deriveNotePage(p, await noteBlockContents(p.id), pageTags.get(p.id) ?? ""));
      await db.writeTransaction((tx) => upsertDocs(tx, docs));
      offset += pageRows.length;
      done += pageRows.length;
      await setMeta(db, "backfill_cursor", String(offset));
      emit({ done });
      await yieldToUI();
    }

    // Occurrences — batched parses (can be many); idempotent, so a resume just
    // reprocesses them.
    for (let occOffset = 0; ; occOffset += NOTE_BATCH) {
      const occRows = await db.getAll<{ id: string; content: string | null }>(
        `SELECT b.id AS id, b.content AS content FROM ${OCC_JOIN} ORDER BY b.id LIMIT ? OFFSET ?`,
        [NOTE_BATCH, occOffset],
      );
      if (occRows.length === 0) break;
      await db.writeTransaction((tx) => upsertOccurrences(tx, occRows.map(deriveOccurrence)));
      done += occRows.length;
      emit({ done });
      await yieldToUI();
    }

    await db.writeTransaction(async (tx) => {
      await pruneOrphans(tx);
      await setMeta(tx, "watermark", startW);
      await setMeta(tx, "schema_version", String(SCHEMA_VERSION));
      await setMeta(tx, "backfill_done", "1");
      await setMeta(tx, "backfill_cursor", "0");
    });
    backfillDone = true;
    if (total > 0) {
      // Show 100% and hold briefly so the sweep is actually seen.
      emit({ status: "building", done: total, total });
      const remaining = Math.max(0, MIN_BUILDING_MS - (Date.now() - buildingStartedAt));
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    }
    emit({ status: "ready", done: total, total });
    log.info(`Search index built (${total} entities)`);
  } catch (err) {
    // Leave backfillDone false so the next open retries; search stays on fallback.
    emit({ status: "idle" });
    log.error("Search index backfill failed", err);
  }
}

// --- Reconciler wiring ---

let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReconcile() {
  if (!available || !backfillDone) return;
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => void enqueue(reconcileNow), RECONCILE_DEBOUNCE_MS);
}

function startReconciler() {
  if (reconcilerStarted || !available) return;
  reconcilerStarted = true;
  db.onChangeWithCallback(
    { onChange: () => scheduleReconcile(), onError: (e) => log.warn("Search reconciler watch error", e) },
    { tables: ["pages", "blocks", "tasks"], throttleMs: 500 },
  );
}

/**
 * Drop the index so the next open rebuilds it from scratch. Called by
 * `resetLocalDatabase` — the search tables aren't PowerSync-managed, so a plain
 * `disconnectAndClear` leaves them (and their "already built" flag) intact.
 */
export async function resetSearchIndex(): Promise<void> {
  try {
    await db.execute("DROP TABLE IF EXISTS search_index");
    await db.execute("DROP TABLE IF EXISTS occurrence_index");
    await db.execute("DROP TABLE IF EXISTS search_meta");
  } catch (err) {
    log.warn("Failed to drop search index during reset", err);
  }
  backfillDone = false;
  emit({ status: "idle", done: 0, total: 0 });
}

// --- Lifecycle entry points (called from db.ts) ---

// In-flight guard so the two entry points below never kick a second backfill
// while the first is still running (they both read backfillDone, set only at end).
let building = false;

/** Build the index once (idempotent), then flush anything changed mid-build. */
async function ensureBuilt(): Promise<void> {
  if (backfillDone || building) return;
  building = true;
  try {
    await enqueue(backfill);
    await enqueue(reconcileNow);
  } finally {
    building = false;
  }
}

/**
 * Local open: start watching for edits and make the index usable immediately.
 * A returning user's data is already local (synced in a prior session), so we
 * build right away rather than waiting for a sync — a schema bump or a wiped
 * index rebuilds on the next launch, no manual reset needed. First-ever users
 * start empty; the reconciler indexes rows as the first sync streams them in.
 */
export async function primeSearchIndexLocal(): Promise<void> {
  if (!available) return;
  startReconciler();
  if (backfillDone) await enqueue(reconcileNow);
  else await ensureBuilt();
}

/**
 * After the first cloud sync: a safety net for the first-ever launch (empty at
 * local-open time). Builds if it still hasn't, else catches up. No-op once built.
 */
export async function buildSearchIndexAfterSync(): Promise<void> {
  if (!available) return;
  try {
    await db.waitForFirstSync();
  } catch {
    /* offline / aborted — nothing to build yet */
  }
  startReconciler();
  if (backfillDone) await enqueue(reconcileNow);
  else await ensureBuilt();
}
