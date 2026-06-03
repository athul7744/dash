import { LexoRank } from "lexorank";
import { v4 as uuidv4 } from "uuid";

import { extractNoteText, serializeNoteDocument } from "@/lib/notes/notes-content";
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
  const tags = new Set<string>();

  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const normalized = normalizeReferenceToken(match[1] ?? "");
    if (normalized) {
      pageTitles.add(normalized);
    }
  }

  for (const match of text.matchAll(/(^|[\s(])#([a-z0-9][a-z0-9_/-]*)/gi)) {
    const normalized = normalizeReferenceToken(match[2] ?? "");
    if (normalized) {
      tags.add(normalized);
    }
  }

  return {
    pageTitles: [...pageTitles],
    tags: [...tags],
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

  const edges = [
    ...references.pageTitles.flatMap((title) => {
      const targetId = pageIdByTitle.get(title);
      return targetId ? [{ targetId, type: "page_ref" }] : [];
    }),
    ...references.tags.map((tag) => ({
      targetId: `tag:${tag}`,
      type: "tag_ref",
    })),
  ];

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

async function replaceNoteEdges(input: ReplaceEdgesInput, ctx: DbContext = db) {
  const userId = await getCurrentUserId();

  await ctx.execute(`DELETE FROM edges WHERE source_block_id = ?`, [input.sourceBlockId]);

  for (const edge of input.edges) {
    const edgeId = edge.id ?? uuidv4();

    await ctx.execute(
      `INSERT INTO edges (id, source_block_id, target_id, user_id, type) VALUES (?, ?, ?, ?, ?)`,
      [edgeId, input.sourceBlockId, edge.targetId, userId, edge.type]
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