/**
 * The generic link layer over the `edges` table.
 *
 * An edge is directional: `source_block_id → target_id`, both any entity id
 * (block id, task id, or page id — all uuids, unique across tables). Type is
 * `'ref'` for id-bound links and `'page_ref'` for legacy note wikilinks.
 *
 * `reconcileEntityRefs` is the single writer: it takes a source id and the
 * text(s) that source owns, extracts the inline `[[ ]]` tokens, and makes the
 * edge rows for that source match. Every source (a note block, a task + its
 * subtasks, an app item) has exactly one reconcile call site, so no two writers
 * ever touch the same source id.
 */

import { v5 as uuidv5 } from "uuid";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { parseRefTokens, normalizeTitleKey } from "@/lib/links/tokens";

/** Minimal DB execution context (a transaction or the db itself). */
export interface DbContext {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** Namespace for deterministic edge ids (kept stable — do not change). */
export const EDGE_ID_NAMESPACE = "9b17a01f-3454-4db0-8f39-7f093ac0f56b";

/** Every edge type that represents a reference link (for query filters). */
export const REF_EDGE_TYPES = ["ref", "page_ref"] as const;
/** SQL fragment: `type IN ('ref','page_ref')`. */
export const REF_TYPE_SQL = "type IN ('ref', 'page_ref')";

type DesiredEdge = { targetId: string; type: string };

/**
 * Make the edge rows leaving `sourceId` exactly match `desired` (deduped by
 * `type:targetId`). Diff-based: deletes duplicates and stale rows, inserts what
 * is missing, and no-ops when already in sync. Edge ids are deterministic
 * (`uuidv5(sourceId|targetId|type)`) so re-runs are stable.
 */
export async function replaceEdges(sourceId: string, desired: DesiredEdge[], ctx: DbContext = db) {
  const keyOf = (targetId: string, type: string) => `${type}:${targetId}`;
  const idOf = (targetId: string, type: string) => uuidv5(`${sourceId}|${targetId}|${type}`, EDGE_ID_NAMESPACE);

  const existingRows = await ctx.getAll<{ id: string; target_id: string; type: string }>(
    "SELECT id, target_id, type FROM edges WHERE source_block_id = ?",
    [sourceId],
  );

  const desiredByKey = new Map<string, { id: string; targetId: string; type: string }>();
  for (const edge of desired) {
    const key = keyOf(edge.targetId, edge.type);
    if (desiredByKey.has(key)) continue;
    desiredByKey.set(key, { id: idOf(edge.targetId, edge.type), targetId: edge.targetId, type: edge.type });
  }

  const existingByKey = new Map<string, { id: string; targetId: string; type: string }>();
  const duplicateIdsToDelete: string[] = [];
  for (const row of existingRows) {
    const key = keyOf(row.target_id, row.type);
    if (existingByKey.has(key)) {
      duplicateIdsToDelete.push(row.id);
      continue;
    }
    existingByKey.set(key, { id: row.id, targetId: row.target_id, type: row.type });
  }

  for (const duplicateId of duplicateIdsToDelete) {
    await ctx.execute("DELETE FROM edges WHERE id = ?", [duplicateId]);
  }

  for (const [key, existing] of existingByKey) {
    if (desiredByKey.has(key)) continue;
    await ctx.execute("DELETE FROM edges WHERE id = ?", [existing.id]);
  }

  const needsInsert = [...desiredByKey.entries()].filter(([key]) => !existingByKey.has(key));
  if (needsInsert.length === 0) return;

  const userId = await getCurrentUserId();
  for (const [, edge] of needsInsert) {
    await ctx.execute(
      "INSERT INTO edges (id, source_block_id, target_id, user_id, type) VALUES (?, ?, ?, ?, ?)",
      [edge.id, sourceId, edge.targetId, userId, edge.type],
    );
  }
}

/**
 * Reconcile the reference edges leaving `sourceId` from the plain text it owns.
 * Pass every string that source contributes (e.g. a task's title plus all its
 * subtask titles) — they are unioned and deduped. Id-bound tokens become `ref`
 * edges to that id; legacy `[[Title]]` tokens resolve against page titles into
 * `page_ref` edges (unresolved titles are dropped, matching the old behavior).
 */
// Serialize reconciles per source id: two concurrent runs (e.g. a card effect
// firing twice) would each read "no edge yet" and then insert the same
// deterministic id, tripping a UNIQUE constraint. Chaining per source avoids it.
const reconcileQueue = new Map<string, Promise<unknown>>();

export async function reconcileEntityRefs(
  sourceId: string,
  texts: Array<string | null | undefined>,
  ctx: DbContext = db,
) {
  const prior = reconcileQueue.get(sourceId) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(() => reconcileEntityRefsInner(sourceId, texts, ctx));
  reconcileQueue.set(sourceId, next);
  try {
    await next;
  } finally {
    if (reconcileQueue.get(sourceId) === next) reconcileQueue.delete(sourceId);
  }
}

async function reconcileEntityRefsInner(
  sourceId: string,
  texts: Array<string | null | undefined>,
  ctx: DbContext,
) {
  const tokens = texts.flatMap((text) => (text ? parseRefTokens(text) : []));

  const idEdges: DesiredEdge[] = tokens
    .filter((token) => token.id)
    .map((token) => ({ targetId: token.id as string, type: "ref" }));

  const legacyTitles = tokens.filter((token) => !token.id).map((token) => normalizeTitleKey(token.label)).filter(Boolean);

  let titleEdges: DesiredEdge[] = [];
  if (legacyTitles.length > 0) {
    const pageRows = await ctx.getAll<{ id: string; title: string | null }>("SELECT id, title FROM pages");
    const idByTitle = new Map<string, string>();
    for (const row of pageRows) {
      const key = normalizeTitleKey(row.title ?? "");
      if (key && !idByTitle.has(key)) idByTitle.set(key, row.id);
    }
    titleEdges = legacyTitles.flatMap((title) => {
      const targetId = idByTitle.get(title);
      return targetId ? [{ targetId, type: "page_ref" }] : [];
    });
  }

  await replaceEdges(sourceId, [...idEdges, ...titleEdges], ctx);
}

/**
 * Delete every edge touching `entityId` in either direction (used on entity
 * delete so no dangling links survive).
 */
export async function deleteEntityEdges(entityId: string, ctx: DbContext = db) {
  await ctx.execute(
    `DELETE FROM edges WHERE source_block_id = ? OR (target_id = ? AND ${REF_TYPE_SQL})`,
    [entityId, entityId],
  );
}
