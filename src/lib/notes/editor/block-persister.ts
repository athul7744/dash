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
import { SQL_UTC_NOW_EXPRESSION } from "@/lib/shared/debounced-update";
import { reconcileNoteBlockEdges } from "@/lib/notes/notes";
import { extractNoteText, normalizeNoteDocument, serializeNoteDocument } from "@/lib/notes/notes-content";

import { assembleDoc, decomposeDoc, type BlockDocumentRow } from "./block-document";
import { diffBlocks, type PersistedBlock } from "./block-diff";

export interface BlockPersisterConfig {
  getDoc: () => JSONContent;
  debounceMs?: number;
  onPersisted?: () => Promise<void> | void;
  /**
   * Called once, immediately before the first real block write, to guarantee
   * the parent page row exists. Lets a page be created lazily (on first
   * keystroke) instead of eagerly — so an opened-but-never-typed editor
   * persists nothing. Must be idempotent.
   */
  ensurePage?: () => Promise<void>;
}

/** A document that is a single block with no text — the untouched starter. */
function isEmptyDoc(decomposed: { content: string }[]): boolean {
  if (decomposed.length === 0) return true;
  if (decomposed.length > 1) return false;
  return extractNoteText(decomposed[0].content) === "";
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

/** Live persisters, so a page-level beforeunload can flush pending saves. */
const activePersisters = new Set<BlockDocumentPersister>();

/** Flush every mounted single-editor persister (call on beforeunload). */
export function flushAllBlockDocumentPersisters(): void {
  for (const persister of activePersisters) void persister.flush();
}

export class BlockDocumentPersister {
  readonly pageId: string;
  private getDoc: () => JSONContent;
  private debounceMs: number;
  private onPersisted?: () => Promise<void> | void;
  private ensurePage?: () => Promise<void>;
  private pageEnsured = false;

  /** Last state we believe is in the DB. Source of truth for the diff. */
  private snapshot = new Map<string, PersistedBlock>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(pageId: string, config: BlockPersisterConfig) {
    this.pageId = pageId;
    this.getDoc = config.getDoc;
    this.debounceMs = config.debounceMs ?? 10_000;
    this.onPersisted = config.onPersisted;
    this.ensurePage = config.ensurePage;
    activePersisters.add(this);
  }

  /** Seed the snapshot from the initial row set (no write). */
  hydrate(rows: BlockDocumentRow[]) {
    this.snapshot = snapshotFromRows(rows);
  }

  /**
   * Seed the snapshot from the editor's OWN serialization of the loaded rows.
   * The editor's schema may normalize content slightly differently from
   * `normalizeNoteDocument`, so baselining from the document (not the raw rows)
   * prevents an unedited block from looking "changed" on first flush.
   */
  hydrateFromDoc(doc: JSONContent, rows: BlockDocumentRow[]) {
    this.snapshot = this.buildSnapshotFromDoc(doc, rows);
  }

  /**
   * Snapshot keyed by block id: content/type/parent from the doc, ranks from
   * rows. Only blocks that ALREADY exist as a DB row are baselined — a block the
   * id-plugin stamped on mount but that has no row yet (the empty-page starter,
   * or the extra blocks a legacy `taskList` row expands into) must NOT be
   * baselined, or its first real content diffs to an `UPDATE … WHERE id=?` that
   * matches zero rows and is silently lost. Leaving it out lets it fall through
   * to an `INSERT` on the first flush.
   */
  private buildSnapshotFromDoc(doc: JSONContent, rows: BlockDocumentRow[]): Map<string, PersistedBlock> {
    const rankById = new Map(rows.map((r) => [r.id, r.sort_rank]));
    const map = new Map<string, PersistedBlock>();
    for (const block of decomposeDoc(doc)) {
      if (!block.blockId) continue; // never baseline an unstamped block
      const sortRank = rankById.get(block.blockId);
      if (sortRank === undefined) continue; // stamped but unpersisted → let it INSERT
      map.set(block.blockId, {
        blockId: block.blockId,
        parentId: block.parentId,
        type: block.type,
        content: block.content,
        sortRank,
      });
    }
    return map;
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

    // Ignore any block that still lacks a stable id (a transient empty starter
    // block before its real rows arrive) — never write "" as a uuid.
    const decomposed = decomposeDoc(this.getDoc()).filter((b) => b.blockId);
    const { writes, next } = diffBlocks(decomposed, this.snapshot);
    if (writes.length === 0) return;

    // Lazy pages: don't materialize the page (or write its stamped-but-empty
    // starter block) until there's real content. The block-id plugin stamps the
    // empty starter with an id on mount, which otherwise looks like a first
    // write. Once the page exists, subsequent empties (e.g. deleting all text)
    // still persist normally.
    if (this.ensurePage && !this.pageEnsured && isEmptyDoc(decomposed)) return;

    this.flushing = true;
    let committed = false;
    try {
      // Materialize the page before its first block write (lazy creation).
      if (!this.pageEnsured && this.ensurePage) {
        await this.ensurePage();
        this.pageEnsured = true;
      }
      const userId = await getCurrentUserId();
      await db.writeTransaction(async (tx) => {
        for (const write of writes) {
          if (write.op === "insert") {
            const { blockId, parentId, type, content, sortRank } = write.row;
            await tx.execute(
              `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ${SQL_UTC_NOW_EXPRESSION})`,
              [blockId, userId, this.pageId, parentId, type, content, sortRank],
            );
            await reconcileNoteBlockEdges(blockId, JSON.parse(content), tx);
          } else if (write.op === "update") {
            const { blockId, parentId, type, content, sortRank } = write.row;
            await tx.execute(
              `UPDATE blocks SET content = ?, type = ?, parent_block_id = ?, sort_rank = ?, updated_at = ${SQL_UTC_NOW_EXPRESSION} WHERE id = ?`,
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

    const { state, view } = editor;
    // Normalize the incoming rows THROUGH the schema so the comparison is
    // apples-to-apples with the editor's own JSON — otherwise an unchanged row
    // set looks different and triggers a needless full-document replace.
    const newDoc = state.schema.nodeFromJSON(assembleDoc(rows));
    const normalized = newDoc.toJSON();
    if (JSON.stringify(normalized) === JSON.stringify(editor.getJSON())) {
      this.snapshot = this.buildSnapshotFromDoc(normalized, rows);
      return;
    }

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
    this.snapshot = this.buildSnapshotFromDoc(normalized, rows);
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    activePersisters.delete(this);
  }
}
