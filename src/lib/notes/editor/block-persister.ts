/**
 * Persists the single-document editor to the per-block `blocks` rows and keeps
 * the open document reconciled with remote (PowerSync) changes.
 *
 * Save path: debounce → `decomposeDoc(getDoc())` → `diffBlocks` against the
 * last-persisted snapshot → apply INSERT/UPDATE/DELETE in one transaction, with
 * per-block `reconcileNoteBlockEdges`. On success the snapshot advances; on
 * failure it is retained and a retry is scheduled (mirrors the old store's
 * failure-retention). Net-zero diffs write nothing.
 *
 * Remote path: when there is no pending local work, re-assemble the document
 * from the incoming rows and replace the doc without touching history
 * (`addToHistory: false`). While the user has unsaved local edits, remote
 * changes are deferred (local-dirty precedence) and applied on the next idle
 * reconcile — sufficient for the single-user-per-account sync model.
 */

import type { Editor, JSONContent } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { reconcileNoteBlockEdges } from "@/lib/notes/notes";
import { normalizeNoteDocument, serializeNoteDocument } from "@/lib/notes/notes-content";

import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "./block-document";
import { diffBlocks, type PersistedBlock } from "./block-diff";

const SQL_UTC_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export interface BlockPersisterConfig {
  getDoc: () => JSONContent;
  debounceMs?: number;
  onPersisted?: () => Promise<void> | void;
}

/** Normalize a row's stored content to the same canonical form decomposeDoc emits. */
function snapshotFromRows(rows: BlockDocumentRow[]): Map<string, PersistedBlock> {
  const map = new Map<string, PersistedBlock>();
  for (const row of rows) {
    map.set(row.id, {
      blockId: row.id,
      parentId: row.parent_block_id,
      type: row.type,
      content: serializeNoteDocument(normalizeNoteDocument(row.content)),
      sortRank: row.sort_rank,
    });
  }
  return map;
}

export class BlockDocumentPersister {
  readonly pageId: string;
  private getDoc: () => JSONContent;
  private debounceMs: number;
  private onPersisted?: () => Promise<void> | void;

  /** Last state we believe is in the DB. Source of truth for the diff. */
  private snapshot = new Map<string, PersistedBlock>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(pageId: string, config: BlockPersisterConfig) {
    this.pageId = pageId;
    this.getDoc = config.getDoc;
    this.debounceMs = config.debounceMs ?? 10_000;
    this.onPersisted = config.onPersisted;
  }

  /** Seed the snapshot from the initial row set (no write). */
  hydrate(rows: BlockDocumentRow[]) {
    this.snapshot = snapshotFromRows(rows);
  }

  /** Block ids whose current document state differs from what's persisted. */
  private dirtyBlockIds(): Set<string> {
    const dirty = new Set<string>();
    const decomposed = decomposeDoc(this.getDoc());
    const seen = new Set<string>();
    for (const block of decomposed) {
      seen.add(block.blockId);
      const prev = this.snapshot.get(block.blockId);
      if (!prev || prev.content !== block.content || prev.type !== block.type || prev.parentId !== block.parentId) {
        dirty.add(block.blockId);
      }
    }
    for (const id of this.snapshot.keys()) if (!seen.has(id)) dirty.add(id);
    return dirty;
  }

  hasPendingWrites(): boolean {
    return this.timer !== null || this.dirtyBlockIds().size > 0;
  }

  /** Schedule a debounced flush (call on every editor update). */
  markChanged() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.persist(), this.debounceMs);
  }

  /** Flush immediately (e.g. on page leave). */
  async flush() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.persist();
  }

  private async persist() {
    this.timer = null;
    if (this.flushing) return;

    const decomposed = decomposeDoc(this.getDoc());
    const { writes, next } = diffBlocks(decomposed, this.snapshot);
    if (writes.length === 0) return;

    this.flushing = true;
    let committed = false;
    try {
      const userId = await getCurrentUserId();
      await db.writeTransaction(async (tx) => {
        for (const write of writes) {
          if (write.op === "insert") {
            const { blockId, parentId, type, content, sortRank } = write.row;
            await tx.execute(
              `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ${SQL_UTC_NOW})`,
              [blockId, userId, this.pageId, parentId, type, content, sortRank],
            );
            await reconcileNoteBlockEdges(blockId, JSON.parse(content), tx);
          } else if (write.op === "update") {
            const { blockId, parentId, type, content, sortRank } = write.row;
            await tx.execute(
              `UPDATE blocks SET content = ?, type = ?, parent_block_id = ?, sort_rank = ?, updated_at = ${SQL_UTC_NOW} WHERE id = ?`,
              [content, type, parentId, sortRank, blockId],
            );
            await reconcileNoteBlockEdges(blockId, JSON.parse(content), tx);
          } else {
            await tx.execute(`DELETE FROM edges WHERE source_block_id = ?`, [write.blockId]);
            await tx.execute(`DELETE FROM blocks WHERE id = ?`, [write.blockId]);
          }
        }
      });
      committed = true;
    } finally {
      this.flushing = false;
    }

    if (committed) {
      // Advance the snapshot only after the write commits (failure retention).
      this.snapshot = next;
      await this.onPersisted?.();
    } else {
      // Retry on the next debounce window.
      this.markChanged();
    }
  }

  /**
   * Reconcile the open document with a remote row set. Local-dirty precedence:
   * while there is unsaved local work, defer (local wins); otherwise rebuild the
   * doc from the rows without adding to the undo history.
   */
  reconcileRemote(editor: Editor, rows: BlockDocumentRow[]) {
    if (this.hasPendingWrites()) return;

    const assembled = assembleDoc(rows);
    const current = editor.getJSON();
    if (JSON.stringify(current) === JSON.stringify(assembled)) {
      this.snapshot = snapshotFromRows(rows);
      return;
    }

    const { state, view } = editor;
    const newDoc = state.schema.nodeFromJSON(assembled);
    const selectionFrom = state.selection.from;
    const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content);
    tr.setMeta("addToHistory", false);
    const mappedPos = Math.min(selectionFrom, tr.doc.content.size);
    try {
      tr.setSelection(Selection.near(tr.doc.resolve(mappedPos)));
    } catch {
      // Selection restore is best-effort.
    }
    view.dispatch(tr);
    this.snapshot = snapshotFromRows(rows);
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
