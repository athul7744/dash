import { PowerSyncBackendConnector, AbstractPowerSyncDatabase, UpdateType } from '@powersync/web';
import { createClient } from '../supabase/client';
import { logger as log } from '../shared/logger';
import { collapseCrudOps, isForeignKeyViolation, type CrudOpKind } from './upload-helpers';

const OP_KIND: Record<UpdateType, CrudOpKind> = {
  [UpdateType.PUT]: 'put',
  [UpdateType.PATCH]: 'patch',
  [UpdateType.DELETE]: 'delete',
};

/** Response codes that indicate a permanent/fatal error — discard the transaction. */
const FATAL_RESPONSE_CODES = [/^22/, /^23/, /^42/];

const PUT_TABLE_ORDER = [
  'pages',
  'blocks',
  'edges',
  'attachments',
];

const DELETE_TABLE_ORDER = [
  'attachments',
  'edges',
  'blocks',
  'pages',
];

function orderTables(tables: string[], preferredOrder: string[]) {
  const preferredIndex = new Map(preferredOrder.map((table, index) => [table, index]));

  return [...tables].sort((left, right) => {
    const leftIndex = preferredIndex.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = preferredIndex.get(right) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right);
  });
}

/** Columns that are JSONB in Supabase but stored as TEXT in PowerSync. */
export const JSON_COLUMNS: Record<string, Set<string>> = {
  tasks: new Set(['tags']),
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
    const batch = await database.getCrudBatch(100);
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
      // Execute bulk PUTs (upsert) per table
      for (const table of orderTables(Object.keys(putOps), PUT_TABLE_ORDER)) {
        const records = [...putOps[table].values()];
        log.info(`BATCH PUT ${table}: ${records.length} record(s)`);
        const { error } = await this.client.from(table).upsert(records);
        if (!error) continue;
        // A foreign-key violation means one row references a parent that no
        // longer exists (an orphan from a create/delete race). The upsert fails
        // atomically, so retry row-by-row and drop only the orphan(s) — keeping
        // the valid rows and preventing the unsatisfiable op from wedging the
        // queue on endless retries. Table-agnostic (keyed on the FK code).
        if (!isForeignKeyViolation(error)) throw new Error(`PUT ${table} failed: ${error.message}`);
        await this.upsertSkippingOrphans(table, records);
      }

      // Execute bulk DELETEs per table
      for (const table of orderTables(Object.keys(deleteOps), DELETE_TABLE_ORDER)) {
        const ids = [...deleteOps[table]];
        if (ids.length === 0) continue;
        log.info(`BATCH DELETE ${table}: ${ids.length} record(s)`);
        const { error } = await this.client.from(table).delete().in('id', ids);
        if (error) throw new Error(`DELETE ${table} failed: ${error.message}`);
      }

      // Execute PATCH operations individually (partial updates can't be easily batched)
      for (const op of patchOps) {
        log.info(`PATCH ${op.table}/${op.id}`, Object.keys(op.data).join(", "));
        const { error } = await this.client.from(op.table).update(op.data).eq('id', op.id);
        if (error) throw new Error(`PATCH ${op.table}/${op.id} failed: ${error.message}`);
      }

      await batch.complete();

      const total = Object.values(putOps).reduce((s, r) => s + r.size, 0)
        + Object.values(deleteOps).reduce((s, r) => s + r.size, 0)
        + patchOps.length;
      log.info(`Upload complete — ${total} op(s) batched`);

    } catch (ex: any) {
      if (typeof ex?.code === 'string' && FATAL_RESPONSE_CODES.some(regex => regex.test(ex.code))) {
        // Fatal error — discard batch to unblock the queue
        log.error("Fatal upload error — discarding batch:", ex.message || ex);
        await batch.complete();
      } else {
        // Retryable error — throw to trigger retry after delay
        log.error("Upload error (will retry):", ex.message || ex);
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
      throw new Error(`PUT ${table} failed: ${error.message}`);
    }
  }
}
