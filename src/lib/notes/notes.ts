import { LexoRank } from "lexorank";
import { v4 as uuidv4 } from "uuid";

import { reconcileEntityRefs } from "@/lib/links/links";
import { createNoteDocumentFromText, extractNoteText, serializeNoteDocument } from "@/lib/notes/notes-content";
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


export async function reconcileNoteBlockEdges(blockId: string, content: JsonValue | undefined, ctx?: DbContext) {
  await reconcileEntityRefs(blockId, [extractPlainText(content)], ctx ?? db);
}

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
  await db.execute(`DELETE FROM edges WHERE target_id = ? AND type IN ('ref', 'page_ref')`, [pageId]);
  await db.execute(`DELETE FROM blocks WHERE page_id = ?`, [pageId]);
  await db.execute(`DELETE FROM pages WHERE id = ?`, [pageId]);
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
 * Create a note page seeded with a single text block containing `body`. Used by
 * the capture flow. Page titles are unique, so a colliding title gets a numeric
 * suffix (then a short random one as a last resort). Returns the new page id.
 */
export async function createNoteFromText(title: string, body: string): Promise<string> {
  const base = normalizeNotePageTitle(title) || "Untitled";
  let pageId: string | null = null;
  for (let attempt = 1; attempt <= 5 && !pageId; attempt++) {
    const candidate = attempt === 1 ? base : `${base} (${attempt})`;
    try {
      pageId = await createNotePage({ title: candidate });
    } catch {
      // Title already exists — try the next suffix.
    }
  }
  pageId ??= await createNotePage({ title: `${base} ${uuidv4().slice(0, 6)}` });

  await createNoteBlock({
    pageId,
    sortRank: LexoRank.middle().format(),
    type: "text",
    content: createNoteDocumentFromText(body),
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
  /**
   * Seed an empty starter block. Set false for surfaces that create the page
   * lazily and let the editor persist the first block itself (the journal), so
   * an opened-but-never-typed page leaves no empty block to orphan.
   */
  createStarterBlock?: boolean;
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
  if (params.createStarterBlock !== false) {
    await createNoteBlock({
      pageId,
      sortRank: LexoRank.middle().format(),
      type: "text",
      content: { type: "doc", content: [] },
    });
  }

  return pageId;
}