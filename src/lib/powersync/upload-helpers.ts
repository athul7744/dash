/**
 * Pure helpers for the PowerSync upload connector (kept free of the Supabase
 * client + @powersync/web imports so they can be unit-tested in isolation).
 */

export type CrudOpKind = "put" | "patch" | "delete";

export interface CollapsibleOp<T extends { id?: string } = Record<string, unknown>> {
  kind: CrudOpKind;
  table: string;
  id: string;
  data: T;
}

export interface CollapsedBatch {
  /** table → (id → upsert record) */
  putOps: Record<string, Map<string, Record<string, unknown>>>;
  /** table → set of ids to delete */
  deleteOps: Record<string, Set<string>>;
  /** patches for rows not net-deleted in the batch, in original order */
  patchOps: CollapsibleOp[];
}

/**
 * Collapse an ordered CRUD op list to one net effect per (table, id),
 * honouring op ORDER so a row is never both upserted and deleted in one batch:
 *   - a PUT supersedes any earlier DELETE of that id (a re-create wins)
 *   - a DELETE supersedes any earlier PUT of that id (a delete wins)
 *   - a PATCH for a row that ends the batch deleted is dropped
 *
 * Without this, a deterministic-id row deleted then re-created before upload
 * (e.g. an empty weekly-journal system page pruned on week change, then
 * reopened) would land in both maps; the connector's phase-ordered "all PUTs
 * then all DELETEs" execution then deletes the just-recreated row and orphans
 * its child blocks, violating blocks_page_id_fkey on the next upload.
 */
export function collapseCrudOps(ops: CollapsibleOp[]): CollapsedBatch {
  const putOps: Record<string, Map<string, Record<string, unknown>>> = {};
  const deleteOps: Record<string, Set<string>> = {};
  const patchOps: CollapsibleOp[] = [];

  for (const op of ops) {
    switch (op.kind) {
      case "put":
        deleteOps[op.table]?.delete(op.id);
        (putOps[op.table] ??= new Map()).set(op.id, op.data);
        break;
      case "delete":
        putOps[op.table]?.delete(op.id);
        (deleteOps[op.table] ??= new Set()).add(op.id);
        break;
      case "patch":
        patchOps.push(op);
        break;
    }
  }

  return {
    putOps,
    deleteOps,
    patchOps: patchOps.filter((op) => !deleteOps[op.table]?.has(op.id)),
  };
}

/**
 * A Postgres foreign-key violation (SQLSTATE 23503) — a row references a parent
 * that doesn't exist on the server (an orphan from a create/delete race). Used
 * to reactively drop the offending row so an unsatisfiable op can't wedge the
 * upload queue on endless retries. Table-agnostic: keyed on the code, not any
 * particular constraint.
 */
export function isForeignKeyViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23503";
}
