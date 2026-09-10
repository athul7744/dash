/**
 * The common file-attachment layer.
 *
 * `attachFile` is the entry point for storing a file: it caches the bytes locally
 * (so the file is usable at once, even offline) and inserts an `attachments`
 * metadata row. The row syncs through PowerSync; the bytes are uploaded to the
 * private `attachments` Storage bucket by the reconciler in `attachment-sync.ts`
 * (watching the table), never through PowerSync.
 *
 * A caller whose owner row isn't written yet splits that in two —
 * `storeFileBytes`, then `insertAttachmentRow` once the owner exists. The upload
 * queue keeps the order local writes were made in, so a row that reaches the
 * server before its parent is refused by the foreign key and dropped, leaving the
 * file on one device only.
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
import { dropBlobPreview, primeBlobPreview } from "./blob-preview";
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

/** Bytes cached under an id, with the row they will become. */
export interface StoredBytes {
  id: string;
  record: AttachmentRecord;
}

/**
 * Cache a file's bytes and mint its id, without recording the row.
 *
 * The half a caller needs when the owner row doesn't exist yet. Local writes are
 * uploaded in the order they were made, so an `attachments` row written before
 * its `blocks` row reaches the server first and is refused by the foreign key —
 * the row is then dropped, and the file exists on this device only. Cached bytes
 * with no row are inert (the reconciler only uploads rows), so nothing leaks if
 * the caller never reaches `insertAttachmentRow`.
 *
 * Throws if the file is empty, too large, or a disallowed type.
 */
export async function storeFileBytes(
  file: Blob,
  target: AttachTarget,
  opts: AttachOptions = {},
): Promise<StoredBytes> {
  const mimeType = opts.mimeType || file.type || "application/octet-stream";
  const fileName = opts.fileName || (file instanceof File ? file.name : "file");
  if (!isAllowed(mimeType, file.size)) {
    throw new Error(`Attachment rejected: ${mimeType} (${file.size} bytes)`);
  }

  const userId = await getCurrentUserId();
  const id = uuidv4();
  const entityId = "pageId" in target ? target.pageId : target.blockId;
  const filePath = buildAttachmentPath(userId, entityId, id, fileName, mimeType);

  // Bytes first, so the reconciler always finds them and the file is renderable
  // the moment the row exists. The preview keeps the blob we already hold, so the
  // first render doesn't wait on a read back out of that cache.
  await blobStore.put(id, file);
  primeBlobPreview(id, file);

  return {
    id,
    record: {
      id,
      user_id: userId,
      page_id: "pageId" in target ? target.pageId : null,
      block_id: "blockId" in target ? target.blockId : null,
      file_path: filePath,
      sync_state: "pending",
      mime_type: mimeType,
      file_name: fileName,
    },
  };
}

/**
 * Record a stored file's row, making it real — visible to the rails, the
 * reconciler (which uploads the bytes) and every other device.
 *
 * Call it only once the row this file belongs to exists, so the upload queue
 * carries them to the server in that order.
 */
export async function insertAttachmentRow(stored: StoredBytes, ctx: DbContext = db): Promise<AttachmentRecord> {
  const { record } = stored;
  await ctx.execute(
    `INSERT INTO attachments (id, user_id, page_id, block_id, file_path, sync_state, mime_type, file_name)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [record.id, record.user_id, record.page_id, record.block_id, record.file_path, record.mime_type, record.file_name],
  );
  return record;
}

/** Drop bytes that will never get a row. Best-effort: nothing else holds them. */
export async function discardStoredBytes(stored: StoredBytes): Promise<void> {
  dropBlobPreview(stored.id);
  await blobStore.remove(stored.id).catch(() => {});
}

/**
 * Store `file` against `target` and record its row, returning the row.
 *
 * For an owner that already exists — a page, or a block already written. When it
 * doesn't yet, use `storeFileBytes` and `insertAttachmentRow` in that order.
 */
export async function attachFile(
  file: Blob,
  target: AttachTarget,
  opts: AttachOptions = {},
): Promise<AttachmentRecord> {
  return insertAttachmentRow(await storeFileBytes(file, target, opts));
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
  for (const r of rows) dropBlobPreview(r.id);
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
