import { LexoRank } from "lexorank";
import { v4 as uuidv4 } from "uuid";

import { extractNoteText, serializeNoteDocument } from "@/lib/notes/notes-content";
import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { cancelExecute, debouncedExecute, debouncedUpdate, SQL_UTC_NOW_EXPRESSION } from "@/lib/shared/debounced-update";

const NOTES_DEBOUNCE_MS = 10_000;
const PAGE_META_DEBOUNCE_MS = 1_000;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

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

interface UpdateBlockInput {
  blockId: string;
  pageId?: string;
  content?: JsonValue;
  type?: string;
}

interface MoveBlockInput {
  blockId: string;
  pageId?: string;
  parentBlockId?: string | null;
  sortRank: string;
}

interface UpsertAttachmentInput {
  id?: string;
  filePath: string;
  syncState?: string;
  pageId?: string | null;
  blockId?: string | null;
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

const pendingEdgeReconciles = new Map<string, JsonValue | undefined>();

type PendingBlockCreate = {
  id: string;
  userId: string;
  pageId: string;
  parentBlockId: string | null;
  type: string;
  content: JsonValue;
  sortRank: string;
  updatedAt: string;
};

const pendingBlockCreates = new Map<string, PendingBlockCreate>();

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

function getPendingBlockCreateEntityId(pageId: string) {
  return `notes:block-create-batch:${pageId}`;
}

function getPendingBlockCreatesForPage(pageId: string) {
  return [...pendingBlockCreates.values()].filter((pendingCreate) => pendingCreate.pageId === pageId);
}

function queuePendingBlockCreateWrite(pageId: string) {
  const pendingCreates = getPendingBlockCreatesForPage(pageId);
  if (pendingCreates.length === 0) {
    cancelExecute(getPendingBlockCreateEntityId(pageId));
    return;
  }

  const valuesSql = pendingCreates.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const params = pendingCreates.flatMap((pendingCreate) => [
    pendingCreate.id,
    pendingCreate.userId,
    pendingCreate.pageId,
    toNullableOwner(pendingCreate.parentBlockId),
    pendingCreate.type,
    serializeNoteDocument(pendingCreate.content),
    pendingCreate.sortRank,
    pendingCreate.updatedAt,
  ]);
  const pendingBlockIds = pendingCreates.map((pendingCreate) => pendingCreate.id);

  debouncedExecute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES ${valuesSql}`,
    params,
    getPendingBlockCreateEntityId(pageId),
    NOTES_DEBOUNCE_MS,
    async () => {
      pendingBlockIds.forEach((blockId) => {
        pendingBlockCreates.delete(blockId);
      });
      await Promise.all(pendingBlockIds.map((blockId) => flushScheduledNoteBlockEdgeReconcile(blockId)));
      touchNotePage(pageId);
    }
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
    serializeNoteDocument(input.content),
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

async function flushScheduledNoteBlockEdgeReconcile(blockId: string) {
  if (!pendingEdgeReconciles.has(blockId)) {
    return;
  }

  const content = pendingEdgeReconciles.get(blockId);
  await reconcileNoteBlockEdges(blockId, content);

  if (pendingEdgeReconciles.has(blockId) && pendingEdgeReconciles.get(blockId) === content) {
    pendingEdgeReconciles.delete(blockId);
  }
}

function getBlockFlushOptions(pageId: string | null | undefined, blockId?: string) {
  if (!pageId) {
    return {
      debounceMs: NOTES_DEBOUNCE_MS,
      afterFlush: async () => {
        if (!blockId) {
          return;
        }

        await flushScheduledNoteBlockEdgeReconcile(blockId);
      },
    };
  }

  return {
    debounceMs: NOTES_DEBOUNCE_MS,
    afterFlush: async () => {
      await db.execute(`UPDATE pages SET updated_at = ${SQL_UTC_NOW_EXPRESSION} WHERE id = ?`, [pageId]);

      if (!blockId) {
        return;
      }

      await flushScheduledNoteBlockEdgeReconcile(blockId);
    },
  };
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

async function reconcileNoteBlockEdges(blockId: string, content: JsonValue | undefined) {
  const text = extractPlainText(content);
  const references = parseReferenceTokens(text);

  const pageRows = references.pageTitles.length > 0
    ? await db.getAll<PageLookupRow>("SELECT id, title FROM pages")
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
  });
}

function scheduleNoteBlockEdgeReconcile(blockId: string, content: JsonValue | undefined) {
  pendingEdgeReconciles.set(blockId, content);
}

function cancelNoteBlockEdgeReconcile(blockId: string) {
  pendingEdgeReconciles.delete(blockId);
}

export function hasPendingNoteEdgeReconciles() {
  return pendingEdgeReconciles.size > 0;
}

export async function flushPendingNoteEdgeReconciles() {
  const pendingBlockIds = [...pendingEdgeReconciles.keys()];
  await Promise.all(pendingBlockIds.map((blockId) => flushScheduledNoteBlockEdgeReconcile(blockId)));
}

export async function createNotePage(input: CreatePageInput = {}) {
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

export async function findNotePageIdByTitle(title: string, excludePageId?: string | null) {
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

export async function createNoteBlock(input: CreateBlockInput) {
  const [blockId] = await createNoteBlocks([input]);
  return blockId;
}

export async function upsertAttachment(input: UpsertAttachmentInput) {
  const attachmentId = input.id ?? uuidv4();
  const userId = await getCurrentUserId();

  await db.execute(
    `INSERT INTO attachments (id, user_id, page_id, block_id, file_path, sync_state)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       page_id = excluded.page_id,
       block_id = excluded.block_id,
       file_path = excluded.file_path,
       sync_state = excluded.sync_state`,
    [
      attachmentId,
      userId,
      toNullableOwner(input.pageId),
      toNullableOwner(input.blockId),
      input.filePath,
      input.syncState ?? "pending",
    ]
  );

  return attachmentId;
}

export async function deleteAttachment(attachmentId: string) {
  await db.execute(`DELETE FROM attachments WHERE id = ?`, [attachmentId]);
}

export async function replaceNoteEdges(input: ReplaceEdgesInput) {
  const userId = await getCurrentUserId();

  await db.execute(`DELETE FROM edges WHERE source_block_id = ?`, [input.sourceBlockId]);

  for (const edge of input.edges) {
    const edgeId = edge.id ?? uuidv4();

    await db.execute(
      `INSERT INTO edges (id, source_block_id, target_id, user_id, type) VALUES (?, ?, ?, ?, ?)`,
      [edgeId, input.sourceBlockId, edge.targetId, userId, edge.type]
    );
  }
}

export async function createNoteBlocks(inputs: CreateBlockInput[]) {
  return insertNoteBlocksImmediately(inputs);
}

export async function queueNoteBlockCreate(input: CreateBlockInput) {
  const [blockId] = await queueNoteBlockCreates([input]);
  return blockId;
}

export async function queueNoteBlockCreates(inputs: CreateBlockInput[]) {
  if (inputs.length === 0) {
    return [] as string[];
  }

  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const blockIds = inputs.map((input) => input.id ?? uuidv4());
  const dirtyPageIds = new Set<string>();

  inputs.forEach((input, index) => {
    const blockId = blockIds[index];
    const pendingCreate: PendingBlockCreate = {
      id: blockId,
      userId,
      pageId: input.pageId,
      parentBlockId: toNullableOwner(input.parentBlockId),
      type: input.type ?? "text",
      content: input.content ?? { type: "doc", content: [] },
      sortRank: input.sortRank,
      updatedAt: now,
    };

    pendingBlockCreates.set(blockId, pendingCreate);
    scheduleNoteBlockEdgeReconcile(blockId, pendingCreate.content);
    dirtyPageIds.add(pendingCreate.pageId);
  });

  dirtyPageIds.forEach((pageId) => {
    queuePendingBlockCreateWrite(pageId);
  });

  return blockIds;
}

export function updateNoteBlock(input: UpdateBlockInput) {
  const pendingCreate = pendingBlockCreates.get(input.blockId);
  if (pendingCreate) {
    if (input.type !== undefined) {
      pendingCreate.type = input.type;
    }

    if (input.content !== undefined) {
      pendingCreate.content = input.content;
      scheduleNoteBlockEdgeReconcile(input.blockId, input.content);
    }

    pendingCreate.updatedAt = new Date().toISOString();
    queuePendingBlockCreateWrite(pendingCreate.pageId);
    return;
  }

  if (input.type !== undefined) {
    debouncedUpdate(input.blockId, "type", input.type, "blocks", getBlockFlushOptions(input.pageId, input.blockId));
  }

  if (input.content !== undefined) {
    scheduleNoteBlockEdgeReconcile(input.blockId, input.content);
    debouncedUpdate(
      input.blockId,
      "content",
      serializeNoteDocument(input.content),
      "blocks",
      getBlockFlushOptions(input.pageId, input.blockId)
    );
  }
}

export function moveNoteBlock(input: MoveBlockInput) {
  const pendingCreate = pendingBlockCreates.get(input.blockId);
  if (pendingCreate) {
    pendingCreate.parentBlockId = toNullableOwner(input.parentBlockId);
    pendingCreate.sortRank = input.sortRank;
    pendingCreate.updatedAt = new Date().toISOString();
    queuePendingBlockCreateWrite(pendingCreate.pageId);
    return;
  }

  const blockFlushOptions = getBlockFlushOptions(input.pageId, input.blockId);
  debouncedUpdate(input.blockId, "parent_block_id", toNullableOwner(input.parentBlockId), "blocks", blockFlushOptions);
  debouncedUpdate(input.blockId, "sort_rank", input.sortRank, "blocks", blockFlushOptions);
}

export async function deleteNoteBlock(blockId: string, pageId?: string) {
  const pendingCreate = pendingBlockCreates.get(blockId);
  if (pendingCreate) {
    cancelNoteBlockEdgeReconcile(blockId);
    pendingBlockCreates.delete(blockId);
    queuePendingBlockCreateWrite(pendingCreate.pageId);
    touchNotePage(pendingCreate.pageId ?? pageId);
    return;
  }

  cancelNoteBlockEdgeReconcile(blockId);
  await db.execute(`DELETE FROM edges WHERE source_block_id = ?`, [blockId]);
  await db.execute(`DELETE FROM blocks WHERE id = ?`, [blockId]);
  touchNotePage(pageId);
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