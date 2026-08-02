/**
 * The tag-membership layer over the `entity_tags` table — the single source of
 * truth for which tags an entity carries, across tasks, bookmarks, events, and
 * notes. Replaces the old JSON tag arrays (tasks.tags, blocks.content.tags,
 * pages.properties.tags).
 *
 * `setEntityTags` is the single writer: given an entity id and the full set of
 * tag ids it should carry, it makes the rows match (diff-based, deterministic
 * ids, serialized per entity) — mirroring `reconcileEntityRefs` for edges.
 */

import { v5 as uuidv5 } from "uuid";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import type { DbContext } from "@/lib/links/links";

export type TagEntityKind = "task" | "bookmark" | "event" | "note";

/** Namespace for deterministic entity_tags ids (kept stable — do not change). */
export const TAG_LINK_NAMESPACE = "2f1c6a90-7b54-4e2a-9c83-8d5a1e4b7f60";

// Serialize writes per entity id: two concurrent runs would each read "no row
// yet" and insert the same deterministic id, tripping the UNIQUE constraint.
const writeQueue = new Map<string, Promise<unknown>>();

/**
 * Make the tag rows for `entityId` exactly match `tagIds` (deduped). Diff-based:
 * deletes removed/duplicate rows, inserts missing ones, no-ops when in sync. Row
 * ids are deterministic (`uuidv5(entityId|tagId)`) so re-runs are stable.
 */
export async function setEntityTags(
  entityId: string,
  kind: TagEntityKind,
  tagIds: string[],
  ctx: DbContext = db,
): Promise<void> {
  const prior = writeQueue.get(entityId) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(() => setEntityTagsInner(entityId, kind, tagIds, ctx));
  writeQueue.set(entityId, next);
  try {
    await next;
  } finally {
    if (writeQueue.get(entityId) === next) writeQueue.delete(entityId);
  }
}

async function setEntityTagsInner(entityId: string, kind: TagEntityKind, tagIds: string[], ctx: DbContext) {
  const idOf = (tagId: string) => uuidv5(`${entityId}|${tagId}`, TAG_LINK_NAMESPACE);

  const desired = new Map<string, string>(); // tagId -> rowId
  for (const tagId of tagIds) {
    if (tagId && !desired.has(tagId)) desired.set(tagId, idOf(tagId));
  }

  const existingRows = await ctx.getAll<{ id: string; tag_id: string }>(
    "SELECT id, tag_id FROM entity_tags WHERE entity_id = ?",
    [entityId],
  );

  const existingByTag = new Map<string, string>();
  const duplicateIds: string[] = [];
  for (const row of existingRows) {
    if (existingByTag.has(row.tag_id)) duplicateIds.push(row.id);
    else existingByTag.set(row.tag_id, row.id);
  }

  for (const dupId of duplicateIds) {
    await ctx.execute("DELETE FROM entity_tags WHERE id = ?", [dupId]);
  }
  for (const [tagId, rowId] of existingByTag) {
    if (!desired.has(tagId)) await ctx.execute("DELETE FROM entity_tags WHERE id = ?", [rowId]);
  }

  const toInsert = [...desired].filter(([tagId]) => !existingByTag.has(tagId));
  if (toInsert.length === 0) return;

  const userId = await getCurrentUserId();
  for (const [tagId, rowId] of toInsert) {
    await ctx.execute(
      "INSERT INTO entity_tags (id, user_id, entity_id, entity_kind, tag_id) VALUES (?, ?, ?, ?, ?)",
      [rowId, userId, entityId, kind, tagId],
    );
  }
}

/** Drop every tag row for an entity (call on entity delete). */
export async function deleteEntityTags(entityId: string, ctx: DbContext = db): Promise<void> {
  await ctx.execute("DELETE FROM entity_tags WHERE entity_id = ?", [entityId]);
}

/** Drop every membership row for a tag definition (call on tag delete; the
 * server FK also cascades). */
export async function deleteTagLinks(tagId: string, ctx: DbContext = db): Promise<void> {
  await ctx.execute("DELETE FROM entity_tags WHERE tag_id = ?", [tagId]);
}
