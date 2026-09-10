import { PowerSyncBackendConnector, AbstractPowerSyncDatabase, UpdateType } from '@powersync/web';
import { createClient } from '../supabase/client';
import { logger as log } from '../shared/logger';
import {
  chunk,
  collapseCrudOps,
  isFatalResponseCode,
  isForeignKeyViolation,
  orderTables,
  UploadError,
  DELETE_TABLE_ORDER,
  PUT_TABLE_ORDER,
  type CrudOpKind,
} from './upload-helpers';

const OP_KIND: Record<UpdateType, CrudOpKind> = {
  [UpdateType.PUT]: 'put',
  [UpdateType.PATCH]: 'patch',
  [UpdateType.DELETE]: 'delete',
};

/**
 * CRUD entries pulled per `uploadData` call.
 *
 * `uploadData` is called again while anything is left, so this is only about how
 * many round trips a bulk write costs: an import writing thousands of rows drains
 * in a handful of calls rather than dozens. The ops are still applied in order,
 * and each request's payload is bounded by the chunk sizes below.
 */
const CRUD_BATCH_LIMIT = 1000;

/** Rows per upsert request — a batch of a thousand blocks is several MB of JSON. */
const UPSERT_CHUNK = 200;

/** Ids per delete request: PostgREST puts `id=in.(…)` in the URL, which has limits. */
const DELETE_CHUNK = 100;

/** Columns that are JSONB in Supabase but stored as TEXT in PowerSync. */
export const JSON_COLUMNS: Record<string, Set<string>> = {
  pages: new Set(['properties']),
  blocks: new Set(['content']),
  property_definitions: new Set(['config']),
};

/** Parse known JSON columns from text back to objects for Supabase upload. */
export function parseJsonColumns(table: string, opData: Record<string, any> | undefined): Record<string, any> {
  if (!opData) return {};
  const jsonCols = JSON_COLUMNS[table];
  if (!jsonCols) return { ...opData };

  const result = { ...opData };
  for (const col of jsonCols) {
    const val = result[col];
    if (typeof val === 'string') {
      try { result[col] = JSON.parse(val); } catch { /* keep as string */ }
    }
  }
  return result;
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  client = createClient();

  async fetchCredentials() {
    log.info("Fetching credentials...");
    const { data: { session }, error } = await this.client.auth.getSession();

    if (error) {
      log.error("fetchCredentials error:", error.message);
      return null;
    }

    if (!session) {
      log.warn("fetchCredentials: No session available");
      return null;
    }

    const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL;
    if (!endpoint) {
      throw new Error("NEXT_PUBLIC_POWERSYNC_URL is not set");
    }

    log.info("Credentials obtained, token expires at:", new Date(session.expires_at! * 1000).toLocaleTimeString());
    return {
      endpoint,
      token: session.access_token,
      expiresAt: new Date(session.expires_at ? session.expires_at * 1000 : Date.now() + 60 * 60 * 1000)
    };
  }

  /**
   * Pre-sorted Batch Strategy:
   * Groups all operations by type and table, then executes bulk calls.
   * PUT → batch upsert per table
   * DELETE → batch delete per table
   * PATCH → individual updates (can't be batched easily)
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    // getCrudBatch returns pending CRUD ops (limited to prevent oversized requests)
    const batch = await database.getCrudBatch(CRUD_BATCH_LIMIT);
    if (!batch) return;

    // Collapse the batch to one net op per (table, id), honouring op ORDER so a
    // deterministic-id row that is deleted then re-created (e.g. an empty
    // daily-journal system page pruned then reopened) is never
    // both upserted and deleted in one batch (see collapseCrudOps).
    const { putOps, deleteOps, patchOps } = collapseCrudOps(
      batch.crud.map((op) => ({
        kind: OP_KIND[op.op],
        table: op.table,
        id: op.id,
        data: { ...parseJsonColumns(op.table, op.opData), id: op.id },
      })),
    );

    try {
      // Execute bulk PUTs (upsert) per table, in chunks so one request stays small
      for (const table of orderTables(Object.keys(putOps), PUT_TABLE_ORDER)) {
        const records = [...putOps[table].values()];
        log.info(`BATCH PUT ${table}: ${records.length} record(s)`);
        for (const part of chunk(records, UPSERT_CHUNK)) {
          const { error } = await this.client.from(table).upsert(part);
          if (!error) continue;
          // A foreign-key violation means one row references a parent that no
          // longer exists (an orphan from a create/delete race). The upsert fails
          // atomically, so retry row-by-row and drop only the orphan(s) — keeping
          // the valid rows and preventing the unsatisfiable op from wedging the
          // queue on endless retries. Table-agnostic (keyed on the FK code).
          if (!isForeignKeyViolation(error)) throw new UploadError(`PUT ${table} failed: ${error.message}`, error.code);
          await this.upsertSkippingOrphans(table, part);
        }
      }

      // Execute bulk DELETEs per table
      for (const table of orderTables(Object.keys(deleteOps), DELETE_TABLE_ORDER)) {
        const ids = [...deleteOps[table]];
        if (ids.length === 0) continue;
        log.info(`BATCH DELETE ${table}: ${ids.length} record(s)`);
        for (const part of chunk(ids, DELETE_CHUNK)) {
          const { error } = await this.client.from(table).delete().in('id', part);
          if (error) throw new UploadError(`DELETE ${table} failed: ${error.message}`, error.code);
        }
      }

      // Execute PATCH operations individually (partial updates can't be easily batched)
      for (const op of patchOps) {
        log.info(`PATCH ${op.table}/${op.id}`, Object.keys(op.data).join(", "));
        const { error } = await this.client.from(op.table).update(op.data).eq('id', op.id);
        if (error) throw new UploadError(`PATCH ${op.table}/${op.id} failed: ${error.message}`, error.code);
      }

      await batch.complete();

      const total = Object.values(putOps).reduce((s, r) => s + r.size, 0)
        + Object.values(deleteOps).reduce((s, r) => s + r.size, 0)
        + patchOps.length;
      log.info(`Upload complete — ${total} op(s) batched`);

    } catch (ex: unknown) {
      const code = (ex as { code?: string } | null)?.code;
      const message = ex instanceof Error ? ex.message : String(ex);
      if (isFatalResponseCode(code)) {
        // Fatal error — discard batch to unblock the queue
        log.error(`Fatal upload error (${code}) — discarding batch:`, message);
        await batch.complete();
      } else {
        // Retryable error — throw to trigger retry after delay
        log.error("Upload error (will retry):", message);
        throw ex;
      }
    }
  }

  /**
   * Upsert records one at a time, dropping any that fail with a foreign-key
   * violation (an orphan whose parent is gone — it can never succeed). Only
   * reached on the rare failure path, after a bulk upsert fails atomically.
   */
  private async upsertSkippingOrphans(table: string, records: Record<string, unknown>[]): Promise<void> {
    for (const record of records) {
      const { error } = await this.client.from(table).upsert(record);
      if (!error) continue;
      if (isForeignKeyViolation(error)) {
        log.warn(`Dropping orphaned ${table} row ${String(record.id)} — parent row missing (${error.message})`);
        continue;
      }
      throw new UploadError(`PUT ${table} failed: ${error.message}`, error.code);
    }
  }
}
