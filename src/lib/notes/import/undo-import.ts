/**
 * Undoing an import after the fact.
 *
 * The point of an import isn't decided in the dialog — it's decided once you've
 * opened a few of the pages and seen whether they came across intact. So the undo
 * has to outlive the dialog, which rules out holding the page ids in component
 * state.
 *
 * It needs no new storage: every imported page already carries
 * `properties.importedBatch`, so the last import can be found by querying for it.
 * That also means the undo survives a reload, which isn't required but costs
 * nothing.
 */

import { db } from "@/lib/powersync/db";
import { softDeleteEntity } from "@/lib/shared/trash";
import { yieldToUI } from "@/lib/shared/utils";

/** Pages soft-deleted per yield, so undoing a large vault doesn't lock the tab. */
const UNDO_BATCH = 25;

/** Only live pages — one already in the Trash has nothing left to undo. */
const BATCH_SELECT = `
  SELECT json_extract(properties, '$.importedBatch') AS batch_id,
         json_extract(properties, '$.importedAt') AS imported_at,
         count(*) AS page_count
  FROM pages
  WHERE deleted_at IS NULL AND json_extract(properties, '$.importedBatch') IS NOT NULL
  GROUP BY batch_id
  ORDER BY imported_at DESC
  LIMIT 1
`;

export interface ImportBatchSummary {
  batchId: string;
  importedAt: string;
  pageCount: number;
}

/** A reactive query for the most recent import still standing. */
export const LAST_IMPORT_BATCH_QUERY = BATCH_SELECT;

export interface LastImportBatchRow {
  batch_id: string | null;
  imported_at: string | null;
  page_count: number;
}

export function toImportBatchSummary(row: LastImportBatchRow | undefined): ImportBatchSummary | null {
  if (!row?.batch_id) return null;
  return {
    batchId: row.batch_id,
    importedAt: row.imported_at ?? "",
    pageCount: row.page_count,
  };
}

/**
 * Move every page from one import to the Trash.
 *
 * A soft delete, so blocks, tags, links and stored images survive and any single
 * page can be restored from `/trash` — undoing an import is reversible in turn.
 * Returns how many pages moved.
 */
export async function undoImportBatch(batchId: string): Promise<number> {
  const rows = await db.getAll<{ id: string }>(
    `SELECT id FROM pages
     WHERE deleted_at IS NULL AND json_extract(properties, '$.importedBatch') = ?`,
    [batchId],
  );

  for (const [index, row] of rows.entries()) {
    await softDeleteEntity("note", row.id);
    if ((index + 1) % UNDO_BATCH === 0) await yieldToUI();
  }

  return rows.length;
}
