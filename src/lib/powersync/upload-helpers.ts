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
 * (e.g. an empty daily-journal system page pruned then reopened) would land in
 * both maps; the connector's phase-ordered "all PUTs
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

/**
 * Upload order for a batch's upserts: a parent table before any table that
 * references it (`pages` → `blocks` → `attachments`, `tags` → `entity_tags`).
 *
 * The connector groups a batch's ops by table, which loses the order the writes
 * were made in — so without this a child row can reach the server before its
 * parent and be rejected by the foreign key. A table missing from this list
 * sorts last, alphabetically, which is how `entity_tags` used to overtake
 * `tags` and lose every tag an import created.
 */
export const PUT_TABLE_ORDER = [
  "pages",
  "blocks",
  "tags",
  "entity_tags",
  "edges",
  "attachments",
] as const;

/** The reverse for deletes: a child row goes before the parent it points at. */
export const DELETE_TABLE_ORDER = [
  "attachments",
  "entity_tags",
  "edges",
  "blocks",
  "tags",
  "pages",
] as const;

/** Sort tables by a preferred order, with anything unlisted last and alphabetical. */
export function orderTables(tables: readonly string[], preferredOrder: readonly string[]): string[] {
  const preferredIndex = new Map(preferredOrder.map((table, index) => [table, index]));

  return [...tables].sort((left, right) => {
    const leftIndex = preferredIndex.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = preferredIndex.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.localeCompare(right);
  });
}

/**
 * SQLSTATE classes that can never succeed on retry: data exceptions (22),
 * integrity violations (23) and syntax/access errors (42).
 *
 * The queue is strictly ordered, so one unsatisfiable op blocks every write
 * behind it — including ones that would succeed. Discarding the batch loses that
 * op, which is the lesser loss.
 */
export function isFatalResponseCode(code: string | null | undefined): boolean {
  return typeof code === "string" && /^(22|23|42)/.test(code);
}

/**
 * An upload failure that keeps the server's SQLSTATE.
 *
 * Rethrowing a bare `Error` drops the code, and the code is the only thing that
 * separates "retry this" from "this can never work" — without it, one permanently
 * rejected row retries forever and the queue never drains.
 */
export class UploadError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string | null) {
    super(message);
    this.name = "UploadError";
    if (code) this.code = code;
  }
}

/** Split a list into fixed-size chunks, so one request's payload stays bounded. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [[...items]];
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
