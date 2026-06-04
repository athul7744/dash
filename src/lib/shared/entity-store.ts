/**
 * EntityStore — Generic base class for managing in-memory entity state with:
 * - Dirty tracking per entity
 * - Debounced persistence to SQLite
 * - Undo/redo stack (command-based)
 * - Subscription for React integration
 * - Reconciliation with remote DB changes (PowerSync)
 *
 * Subclasses implement domain-specific mutations, persistence, and reconciliation.
 */

type SubscribeFn = () => void;

export interface EntityStoreConfig {
  /** Debounce delay (ms) before flushing to DB. Default 800. */
  debounceMs?: number;
  /** Called after each successful persist (e.g. to bump parent timestamp). */
  onPersisted?: () => Promise<void> | void;
}

export abstract class EntityStore<TNode, TCommand> {
  protected nodes: Map<string, TNode> = new Map();

  private dirtyIds = new Set<string>();
  private structureDirty = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private undoStack: TCommand[] = [];
  private redoStack: TCommand[] = [];
  private maxUndoSize = 80;

  private listeners = new Set<SubscribeFn>();
  private snapshotVersion = 0;

  protected readonly debounceMs: number;
  private readonly onPersisted: (() => Promise<void> | void) | undefined;

  constructor(config: EntityStoreConfig = {}) {
    this.debounceMs = config.debounceMs ?? 800;
    this.onPersisted = config.onPersisted;
  }

  // ─── Dirty tracking + debounce ──────────────────────────────────────────────

  protected markDirty(id: string) {
    this.dirtyIds.add(id);
    this.schedulePersist();
  }

  protected unmarkDirty(id: string) {
    this.dirtyIds.delete(id);
  }

  protected markStructureDirty() {
    this.structureDirty = true;
    this.schedulePersist();
  }

  protected schedulePersist() {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(), this.debounceMs);
  }

  private async persist() {
    this.persistTimer = null;

    const dirty = new Set(this.dirtyIds);
    const structDirty = this.structureDirty;
    this.dirtyIds.clear();
    this.structureDirty = false;

    let didWrite = false;

    if (dirty.size > 0) {
      if (await this.flushDirtyEntities(dirty)) didWrite = true;
    }

    if (structDirty) {
      if (await this.flushStructure()) didWrite = true;
    }

    if (didWrite) {
      await this.onPersisted?.();
    }
  }

  /** Force-flush all pending writes immediately (e.g. on page leave). */
  async flush() {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.dirtyIds.size > 0 || this.structureDirty) {
      await this.persist();
    }
  }

  /** Check if there are pending writes. */
  hasPendingWrites(id?: string): boolean {
    if (id) return this.dirtyIds.has(id);
    return this.dirtyIds.size > 0 || this.structureDirty;
  }

  // ─── Undo / Redo ───────────────────────────────────────────────────────────

  protected pushCommand(cmd: TCommand) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxUndoSize) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.notify();
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    this.redoStack.push(cmd);
    this.applyUndo(cmd);
    this.schedulePersist();
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    this.undoStack.push(cmd);
    this.applyRedo(cmd);
    this.schedulePersist();
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  // ─── Subscription (React useSyncExternalStore) ──────────────────────────────

  subscribe(fn: SubscribeFn): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  protected notify() {
    this.snapshotVersion++;
    for (const fn of this.listeners) fn();
  }

  /** Monotonically increasing version for snapshot identity. */
  get version() { return this.snapshotVersion; }

  // ─── Reconcile with DB (PowerSync reactive queries) ─────────────────────────

  /**
   * Reconcile in-memory state with rows from a reactive query.
   * Skips locally-dirty nodes (local state wins until flushed).
   */
  reconcile(rows: { id: string }[]) {
    const remoteIds = new Set<string>();

    for (const row of rows) {
      remoteIds.add(row.id);
      if (this.dirtyIds.has(row.id)) continue;
      this.reconcileNode(row);
    }

    for (const id of this.nodes.keys()) {
      if (!remoteIds.has(id) && !this.isPendingCreate(id)) {
        this.onRemoteDelete(id);
      }
    }

    this.notify();
  }

  // ─── Abstract: implemented by each app ──────────────────────────────────────

  /** Flush dirty entity content/fields to DB. Returns true if any row was written. */
  protected abstract flushDirtyEntities(dirtyIds: Set<string>): Promise<boolean>;

  /** Flush structural changes (INSERT/DELETE rows) to DB. Returns true if any row was written. */
  protected abstract flushStructure(): Promise<boolean>;

  /** Apply an undo command to in-memory state. */
  protected abstract applyUndo(cmd: TCommand): void;

  /** Apply a redo command to in-memory state. */
  protected abstract applyRedo(cmd: TCommand): void;

  /** Update one node from a DB row (remote change). */
  protected abstract reconcileNode(row: any): void;

  /** Handle a node deleted remotely. */
  protected abstract onRemoteDelete(id: string): void;

  /** Check if a node is a local pending create (not yet in DB). */
  protected abstract isPendingCreate(id: string): boolean;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  dispose() {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.listeners.clear();
  }
}
