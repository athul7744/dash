import { LexoRank } from "lexorank";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

import { extractNoteText, serializeNoteDocument } from "@/lib/notes/notes-content";
import { systemPageId, type SystemPageKind } from "@/lib/notes/system-pages";
import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { debouncedExecute, debouncedUpdate, SQL_UTC_NOW_EXPRESSION } from "@/lib/shared/debounced-update";
import type { JsonValue } from "@/lib/shared/types";

/** Minimal interface for a DB execution context (transaction or db). */
interface DbContext {
  execute(sql: string, params?: any[]): Promise<any>;
  getAll<T>(sql: string, params?: any[]): Promise<T[]>;
}

const NOTES_DEBOUNCE_MS = 10_000;
const PAGE_META_DEBOUNCE_MS = 1_000;

export type { JsonValue } from "@/lib/shared/types";

export type NoteBlockInsert = {
  content: JsonValue;
  children?: NoteBlockInsert[];
};

interface CreatePageInput {
  id?: string;
  title?: string;
  properties?: Record<string, JsonValue>;
}

interface CreateBlockInput {
  id?: string;
  pageId: string;
  parentBlockId?: string | null;
  type?: string;
  content?: JsonValue;
  sortRank: string;
}

interface ReplaceEdgesInput {
  sourceBlockId: string;
  edges: Array<{
    id?: string;
    targetId: string;
    type: string;
  }>;
}

const EDGE_ID_NAMESPACE = "9b17a01f-3454-4db0-8f39-7f093ac0f56b";

type PageLookupRow = {
  id: string;
  title: string | null;
};

type NotePageTitleLookupRow = {
  id: string;
  title: string | null;
};


function toJson(value: JsonValue | undefined) {
  return JSON.stringify(value ?? {});
}

function toNullableOwner(ownerId?: string | null) {
  return ownerId ?? null;
}

export function normalizeNotePageTitle(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeReferenceToken(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractPlainText(value: JsonValue | undefined) {
  if (value === undefined) return "";

  return extractNoteText(value);
}

function touchNotePage(pageId: string | null | undefined) {
  if (!pageId) return;

  debouncedExecute(
    `UPDATE pages SET updated_at = ${SQL_UTC_NOW_EXPRESSION} WHERE id = ?`,
    [pageId],
    `notes:page-touch:${pageId}`,
    NOTES_DEBOUNCE_MS
  );
}

async function insertNoteBlocksImmediately(inputs: CreateBlockInput[]) {
  if (inputs.length === 0) {
    return [] as string[];
  }

  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const blockIds = inputs.map((input) => input.id ?? uuidv4());
  const valuesSql = inputs.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const params = inputs.flatMap((input, index) => [
    blockIds[index],
    userId,
    input.pageId,
    toNullableOwner(input.parentBlockId),
    input.type ?? "text",
    (input.type && input.type !== "text") ? JSON.stringify(input.content) : serializeNoteDocument(input.content),
    input.sortRank,
    now,
  ]);
  const pageIds = [...new Set(inputs.map((input) => input.pageId))];

  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES ${valuesSql}`,
    params
  );

  await Promise.all(inputs.map((input, index) => reconcileNoteBlockEdges(blockIds[index], input.content)));
  pageIds.forEach((pageId) => touchNotePage(pageId));

  return blockIds;
}


function parseReferenceTokens(text: string) {
  const pageTitles = new Set<string>();

  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const normalized = normalizeReferenceToken(match[1] ?? "");
    if (normalized) {
      pageTitles.add(normalized);
    }
  }

  return {
    pageTitles: [...pageTitles],
  };
}

export async function reconcileNoteBlockEdges(blockId: string, content: JsonValue | undefined, ctx?: DbContext) {
  const execCtx = ctx ?? db;
  const text = extractPlainText(content);
  const references = parseReferenceTokens(text);

  const pageRows = references.pageTitles.length > 0
    ? await execCtx.getAll<PageLookupRow>("SELECT id, title FROM pages")
    : [];

  const pageIdByTitle = new Map<string, string>();
  for (const row of pageRows) {
    const normalizedTitle = normalizeReferenceToken(row.title ?? "");
    if (normalizedTitle && !pageIdByTitle.has(normalizedTitle)) {
      pageIdByTitle.set(normalizedTitle, row.id);
    }
  }

  const edges = references.pageTitles.flatMap((title) => {
    const targetId = pageIdByTitle.get(title);
    return targetId ? [{ targetId, type: "page_ref" }] : [];
  });

  await replaceNoteEdges({
    sourceBlockId: blockId,
    edges,
  }, execCtx);
}

/** @deprecated Edge reconciles are now synchronous during block flush. Always returns false. */
export function hasPendingNoteEdgeReconciles() {
  return false;
}

/** @deprecated Edge reconciles are now synchronous during block flush. No-op. */
export async function flushPendingNoteEdgeReconciles() {}

async function createNotePage(input: CreatePageInput = {}) {
  const normalizedTitle = normalizeNotePageTitle(input.title) || "Untitled";
  const existingPageId = await findNotePageIdByTitle(normalizedTitle);

  if (existingPageId) {
    throw new Error("A page with this title already exists.");
  }

  const pageId = input.id ?? uuidv4();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO pages (id, user_id, title, properties, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [pageId, userId, normalizedTitle, toJson(input.properties), now, now]
  );

  return pageId;
}

async function findNotePageIdByTitle(title: string, excludePageId?: string | null) {
  const normalizedTitle = normalizeNotePageTitle(title);
  if (!normalizedTitle) {
    return null;
  }

  const pageRows = await db.getAll<NotePageTitleLookupRow>("SELECT id, title FROM pages");
  const matchingPage = pageRows.find((page) => {
    if (excludePageId && page.id === excludePageId) {
      return false;
    }

    return normalizeNotePageTitle(page.title).toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase();
  });

  return matchingPage?.id ?? null;
}

export async function isNotePageTitleAvailable(title: string, excludePageId?: string | null) {
  const existingPageId = await findNotePageIdByTitle(title, excludePageId);
  return existingPageId === null;
}

export function updateNotePageTitle(pageId: string, title: string) {
  debouncedUpdate(pageId, "title", title, "pages", PAGE_META_DEBOUNCE_MS);
}

export function updateNotePageProperties(pageId: string, properties: Record<string, JsonValue>) {
  debouncedUpdate(pageId, "properties", JSON.stringify(properties), "pages", PAGE_META_DEBOUNCE_MS);
}

export async function deleteNotePage(pageId: string) {
  await db.execute(`DELETE FROM attachments WHERE block_id IN (SELECT id FROM blocks WHERE page_id = ?)`, [pageId]);
  await db.execute(`DELETE FROM attachments WHERE page_id = ?`, [pageId]);
  await db.execute(`DELETE FROM edges WHERE source_block_id IN (SELECT id FROM blocks WHERE page_id = ?)`, [pageId]);
  await db.execute(`DELETE FROM edges WHERE target_id = ? AND type = 'page_ref'`, [pageId]);
  await db.execute(`DELETE FROM blocks WHERE page_id = ?`, [pageId]);
  await db.execute(`DELETE FROM pages WHERE id = ?`, [pageId]);
}

/**
 * Delete journal "system pages" that were created but left empty (a single
 * text block with no text), except `exceptPageId` (the week currently open).
 * Called opportunistically on mount / week change — this is idempotent and
 * never touches the page whose block store is live, so it is safe under React
 * StrictMode double-invocation (unlike an unmount-time delete).
 */
export async function pruneEmptyJournalPages(exceptPageId?: string | null) {
  const rows = await db.getAll<{ page_id: string; block_count: number; first_content: string | null }>(
    `SELECT p.id AS page_id,
            (SELECT COUNT(*) FROM blocks b WHERE b.page_id = p.id) AS block_count,
            (SELECT b.content FROM blocks b WHERE b.page_id = p.id ORDER BY b.sort_rank ASC LIMIT 1) AS first_content
     FROM pages p
     WHERE json_extract(p.properties, '$.kind') = 'journal'`
  );

  for (const row of rows) {
    if (exceptPageId && row.page_id === exceptPageId) continue;
    const isEmpty =
      row.block_count <= 1 && (row.block_count === 0 || extractNoteText(row.first_content) === "");
    if (isEmpty) {
      await deleteNotePage(row.page_id);
    }
  }
}

async function replaceNoteEdges(input: ReplaceEdgesInput, ctx: DbContext = db) {
  const buildEdgeKey = (targetId: string, type: string) => `${type}:${targetId}`;
  const createDeterministicEdgeId = (sourceBlockId: string, targetId: string, type: string) => (
    uuidv5(`${sourceBlockId}|${targetId}|${type}`, EDGE_ID_NAMESPACE)
  );

  const existingRows = await ctx.getAll<{ id: string; target_id: string; type: string }>(
    `SELECT id, target_id, type FROM edges WHERE source_block_id = ?`,
    [input.sourceBlockId]
  );

  const desiredByKey = new Map<string, { id: string; targetId: string; type: string }>();
  for (const edge of input.edges) {
    const key = buildEdgeKey(edge.targetId, edge.type);
    if (desiredByKey.has(key)) continue;

    desiredByKey.set(key, {
      id: edge.id ?? createDeterministicEdgeId(input.sourceBlockId, edge.targetId, edge.type),
      targetId: edge.targetId,
      type: edge.type,
    });
  }

  const existingByKey = new Map<string, { id: string; targetId: string; type: string }>();
  const duplicateIdsToDelete: string[] = [];

  for (const row of existingRows) {
    const key = buildEdgeKey(row.target_id, row.type);
    if (existingByKey.has(key)) {
      duplicateIdsToDelete.push(row.id);
      continue;
    }

    existingByKey.set(key, {
      id: row.id,
      targetId: row.target_id,
      type: row.type,
    });
  }

  for (const duplicateId of duplicateIdsToDelete) {
    await ctx.execute(`DELETE FROM edges WHERE id = ?`, [duplicateId]);
  }

  for (const [key, existing] of existingByKey) {
    if (desiredByKey.has(key)) continue;
    await ctx.execute(`DELETE FROM edges WHERE id = ?`, [existing.id]);
  }

  const needsInsert = [...desiredByKey.entries()].filter(([key]) => !existingByKey.has(key));
  if (needsInsert.length === 0) {
    return;
  }

  const userId = await getCurrentUserId();
  for (const [, edge] of needsInsert) {
    await ctx.execute(
      `INSERT INTO edges (id, source_block_id, target_id, user_id, type) VALUES (?, ?, ?, ?, ?)`,
      [edge.id, input.sourceBlockId, edge.targetId, userId, edge.type]
    );
  }
}

async function createNoteBlock(input: CreateBlockInput) {
  const [blockId] = await createNoteBlocks([input]);
  return blockId;
}

async function createNoteBlocks(inputs: CreateBlockInput[]) {
  return insertNoteBlocksImmediately(inputs);
}

export async function createStarterPage(title = "Untitled") {
  const pageId = await createNotePage({ title });
  await createNoteBlock({
    pageId,
    sortRank: LexoRank.middle().format(),
    type: "text",
    content: { type: "doc", content: [] },
  });
  return pageId;
}

/**
 * Idempotently create a feature-owned "system page" (see system-pages.ts) with a
 * single empty starter block. Located/created by its deterministic id, so the
 * title-uniqueness guard in createNotePage is bypassed. Returns the page id.
 */
export async function ensureSystemPage(params: {
  kind: SystemPageKind;
  key: string;
  title: string;
}) {
  const userId = await getCurrentUserId();
  const pageId = systemPageId(userId, params.kind, params.key);

  const existing = await db.getAll<{ id: string }>("SELECT id FROM pages WHERE id = ? LIMIT 1", [pageId]);
  if (existing.length > 0) {
    return pageId;
  }

  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO pages (id, user_id, title, properties, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      pageId,
      userId,
      normalizeNotePageTitle(params.title) || "Untitled",
      JSON.stringify({ kind: params.kind, key: params.key }),
      now,
      now,
    ]
  );
  await createNoteBlock({
    pageId,
    sortRank: LexoRank.middle().format(),
    type: "text",
    content: { type: "doc", content: [] },
  });

  return pageId;
}