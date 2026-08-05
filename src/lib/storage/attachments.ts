/**
 * The common file-attachment layer.
 *
 * `attachFile` is the single entry point for storing a file: it caches the bytes
 * locally (so the file is usable at once, even offline) and inserts an
 * `attachments` metadata row. The row syncs through PowerSync; the bytes are
 * uploaded to the private `attachments` Storage bucket by the reconciler in
 * `attachment-sync.ts` (watching the table), never through PowerSync.
 *
 * `deleteEntityAttachments` drops every row owned by an entity — call it from an
 * entity's delete fan-out beside `deleteEntityEdges` / `deleteEntityTags`. The
 * bytes follow best-effort now and are guaranteed gone by the orphan sweep.
 */

import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/powersync/db";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/shared/auth";
import { logger as log } from "@/lib/shared/logger";
import type { DbContext } from "@/lib/links/links";
import type { AttachmentRecord } from "@/lib/powersync/AppSchema";
import * as blobStore from "./local-blob-store";
import { buildAttachmentPath, isAllowed } from "./paths";

export { MAX_ATTACHMENT_BYTES } from "./paths";

export const BUCKET = "attachments";

/** The private Storage bucket handle (RLS restricts each user to their own folder). */
export function bucket() {
  return createClient().storage.from(BUCKET);
}

/** A file is owned by exactly one of a note page or a block. */
export type AttachTarget = { pageId: string } | { blockId: string };

export interface AttachOptions {
  /** Original file name (for the rail label + downloads). Defaults from a `File`. */
  fileName?: string;
  /** MIME type. Defaults from a `File`; required when passing a bare `Blob`. */
  mimeType?: string;
}

/**
 * Store `file` against `target`, returning the metadata row. Caches the bytes
 * locally and marks the row `pending`; the reconciler uploads when online. Throws
 * if the file is empty, too large, or a disallowed type.
 */
export async function attachFile(
  file: Blob,
  target: AttachTarget,
  opts: AttachOptions = {},
): Promise<AttachmentRecord> {
  const mimeType = opts.mimeType || file.type || "application/octet-stream";
  const fileName = opts.fileName || (file instanceof File ? file.name : "file");
  if (!isAllowed(mimeType, file.size)) {
    throw new Error(`Attachment rejected: ${mimeType} (${file.size} bytes)`);
  }

  const userId = await getCurrentUserId();
  const id = uuidv4();
  const entityId = "pageId" in target ? target.pageId : target.blockId;
  const filePath = buildAttachmentPath(userId, entityId, id, fileName, mimeType);

  // Cache the bytes first, so the reconciler always finds them and the file is
  // renderable the moment the row exists.
  await blobStore.put(id, file);

  const pageId = "pageId" in target ? target.pageId : null;
  const blockId = "blockId" in target ? target.blockId : null;
  await db.execute(
    `INSERT INTO attachments (id, user_id, page_id, block_id, file_path, sync_state, mime_type, file_name)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, userId, pageId, blockId, filePath, mimeType, fileName],
  );

  return { id, user_id: userId, page_id: pageId, block_id: blockId, file_path: filePath, sync_state: "pending", mime_type: mimeType, file_name: fileName };
}

/**
 * Delete every attachment owned by `entityId` (a page id or block id). Removes the
 * synced rows now; the bytes are removed best-effort immediately and swept for
 * certain afterward. Pass a transaction `ctx` to fold the row deletes into an
 * entity's delete transaction.
 */
export async function deleteEntityAttachments(entityId: string, ctx: DbContext = db): Promise<void> {
  const rows = await ctx.getAll<{ id: string; file_path: string }>(
    "SELECT id, file_path FROM attachments WHERE page_id = ? OR block_id = ?",
    [entityId, entityId],
  );
  if (rows.length === 0) return;
  await ctx.execute("DELETE FROM attachments WHERE page_id = ? OR block_id = ?", [entityId, entityId]);
  // Bytes: fire-and-forget so a transaction ctx isn't held open on network I/O.
  // The orphan sweep is the guaranteed backstop when this misses (offline).
  void purgeFiles(rows);
}

/** Delete a single attachment row and its bytes (rail delete button). */
export async function deleteAttachment(att: Pick<AttachmentRecord, "id" | "file_path">): Promise<void> {
  await db.execute("DELETE FROM attachments WHERE id = ?", [att.id]);
  void purgeFiles([{ id: att.id, file_path: att.file_path }]);
}

/** Remove cached blobs + Storage objects for deleted rows. Best-effort. */
async function purgeFiles(rows: Array<{ id: string; file_path: string | null }>): Promise<void> {
  await Promise.all(rows.map((r) => blobStore.remove(r.id).catch(() => {})));
  const paths = rows.map((r) => r.file_path).filter((p): p is string => !!p);
  if (paths.length === 0) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    log.info(`Attachment delete deferred (offline) — orphan sweep will remove`, paths);
    return;
  }
  try {
    log.info(`Attachment delete → removing ${paths.length} file(s)`, paths);
    const { error } = await bucket().remove(paths);
    if (error) log.warn("Attachment delete failed (orphan sweep will retry)", error, paths);
    else log.info(`Attachment deleted ✓ ${paths.length} file(s)`);
  } catch (err) {
    log.warn("Attachment delete failed (orphan sweep will retry)", err, paths);
  }
}
