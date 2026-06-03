/**
 * NoteBlockStore — Manages all blocks for a single note page.
 *
 * - In-memory block tree (structural metadata + Tiptap editor refs)
 * - Tiptap editors are the content source of truth (no duplication)
 * - Structural undo/redo (split, merge, delete, move, create)
 * - Debounced persistence to SQLite
 * - PowerSync reconciliation for remote changes
 */

import { v4 as uuidv4 } from "uuid";
import type { Editor } from "@tiptap/core";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { EntityStore, type EntityStoreConfig } from "@/lib/shared/entity-store";
import type { JsonValue } from "@/lib/shared/types";
import { normalizeNoteDocument, serializeNoteDocument } from "@/lib/notes/notes-content";
import { reconcileNoteBlockEdges } from "@/lib/notes/notes";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { JsonValue } from "@/lib/shared/types";

export interface BlockNode {
  id: string;
  parentId: string | null;
  sortRank: string;
  type: string;
  editorRef: Editor | null;
}

export interface BlockRow {
  id: string;
  page_id: string;
  parent_block_id: string | null;
  sort_rank: string;
  type: string;
  content: string;
}

interface BlockSnapshot {
  id: string;
  parentId: string | null;
  sortRank: string;
  type: string;
  content: string; // serialized JSON
}

export type NoteBlockCommand =
  | { kind: "block-create"; blockId: string; snapshot: BlockSnapshot }
  | { kind: "block-delete"; snapshot: BlockSnapshot }
  | { kind: "block-delete-range"; snapshots: BlockSnapshot[] }
  | { kind: "block-move"; blockId: string; prev: { parentId: string | null; sortRank: string }; next: { parentId: string | null; sortRank: string } }
  | { kind: "block-move-range"; moves: { blockId: string; prev: { parentId: string | null; sortRank: string }; next: { parentId: string | null; sortRank: string } }[] }
  | { kind: "block-merge"; deletedSnapshot: BlockSnapshot; targetBlockId: string; prevTargetContent: string; mergedContent: string }
  | { kind: "block-split"; sourceBlockId: string; newBlockId: string; prevSourceContent: string; leftContent: string; rightContent: string; newSortRank: string; newParentId: string | null }
  | { kind: "block-content-change"; blockId: string; prevContent: string; prevType: string; nextContent: string; nextType: string }
  | { kind: "batch"; commands: NoteBlockCommand[] };

interface NoteBlockStoreConfig extends EntityStoreConfig {
  /** Called when undo/redo restores block content (so Tiptap can update). */
  onContentRestored?: (blockId: string, content: string) => void;
  /** Called when undo/redo removes a block (so Tiptap can clean up). */
  onBlockRemoved?: (blockId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SQL_UTC_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// ─── Store implementation ─────────────────────────────────────────────────────

export class NoteBlockStore extends EntityStore<BlockNode, NoteBlockCommand> {
  readonly pageId: string;

  private pendingCreates = new Set<string>();
  private pendingDeletes = new Set<string>();
  private pendingInitialContent = new Map<string, JsonValue>();
  private contentCache = new Map<string, string>();
  private flushingIds = new Set<string>();
  private orderedBlocksCache: BlockNode[] | null = null;

  private onContentRestored: NoteBlockStoreConfig["onContentRestored"];
  private onBlockRemoved: NoteBlockStoreConfig["onBlockRemoved"];

  constructor(pageId: string, config: NoteBlockStoreConfig = {}) {
    super({
      debounceMs: config.debounceMs ?? 10_000,
      onPersisted: async () => {
        await db.execute(`UPDATE pages SET updated_at = ${SQL_UTC_NOW} WHERE id = ?`, [pageId]);
      },
    });
    this.pageId = pageId;
    this.onContentRestored = config.onContentRestored;
    this.onBlockRemoved = config.onBlockRemoved;
  }

  // ─── Overrides ──────────────────────────────────────────────────────────────

  protected override markDirty(id: string) {
    this.contentCache.delete(id);
    super.markDirty(id);
  }

  // ─── Hydration ──────────────────────────────────────────────────────────────

  /**
   * Hydrate from block rows (initial load or full reconcile).
   * Replaces all in-memory state. Preserves editor refs for existing blocks.
   */
  hydrate(rows: BlockRow[]) {
    const prevEditorRefs = new Map<string, Editor | null>();
    for (const [id, node] of this.nodes) {
      prevEditorRefs.set(id, node.editorRef);
    }

    this.nodes.clear();
    this.pendingInitialContent.clear();
    this.contentCache.clear();
    this.orderedBlocksCache = null;

    for (const row of rows) {
      this.nodes.set(row.id, {
        id: row.id,
        parentId: row.parent_block_id,
        sortRank: row.sort_rank,
        type: row.type,
        editorRef: prevEditorRefs.get(row.id) ?? null,
      });
      // Store initial content for blocks without an editor ref yet
      if (!prevEditorRefs.has(row.id)) {
        this.pendingInitialContent.set(row.id, normalizeNoteDocument(row.content) as JsonValue);
      }
    }

    this.notify();
  }

  // ─── Editor ref management ──────────────────────────────────────────────────

  setEditorRef(blockId: string, editor: Editor | null) {
    const node = this.nodes.get(blockId);
    if (node) node.editorRef = editor;
  }

  getEditorRef(blockId: string): Editor | null {
    return this.nodes.get(blockId)?.editorRef ?? null;
  }

  setBlockType(blockId: string, type: string) {
    const node = this.nodes.get(blockId);
    if (node) node.type = type;
  }

  /** Content to initialize a newly mounted Tiptap editor with. */
  getInitialContent(blockId: string): JsonValue | undefined {
    return this.pendingInitialContent.get(blockId);
  }

  /** Remove consumed initial content after editor mounts. */
  consumeInitialContent(blockId: string) {
    this.pendingInitialContent.delete(blockId);
  }

  // ─── Content reads ──────────────────────────────────────────────────────────

  /** Get serialized content from cache, live editor, or pending initial content. */
  getContent(blockId: string): string {
    // Fast path: cached from last commitContent or reconcile
    const cached = this.contentCache.get(blockId);
    if (cached) return cached;

    const node = this.nodes.get(blockId);
    if (node?.editorRef) {
      const serialized = serializeNoteDocument(node.editorRef.getJSON());
      this.contentCache.set(blockId, serialized);
      return serialized;
    }
    // Fallback: pending initial content
    const initial = this.pendingInitialContent.get(blockId);
    if (initial) {
      const serialized = serializeNoteDocument(initial);
      this.contentCache.set(blockId, serialized);
      return serialized;
    }
    return serializeNoteDocument({ type: "doc", content: [] });
  }

  /** Take a full snapshot of a block for undo purposes. */
  private snapshot(blockId: string): BlockSnapshot {
    const node = this.nodes.get(blockId)!;
    return {
      id: node.id,
      parentId: node.parentId,
      sortRank: node.sortRank,
      type: node.type,
      content: this.getContent(blockId),
    };
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Mark a block as dirty (content changed in Tiptap).
   * Called by Tiptap's onUpdate callback — content lives in the editor.
   */
  commitContent(blockId: string) {
    this.markDirty(blockId);
    // Cache after markDirty (which clears the cache) so it's fresh
    const node = this.nodes.get(blockId);
    if (node?.editorRef) {
      this.contentCache.set(blockId, serializeNoteDocument(node.editorRef.getJSON()));
    }
  }

  /**
   * Directly set content for blocks without a Tiptap editor (e.g. query blocks).
   */
  setContentDirect(blockId: string, content: JsonValue) {
    const serialized = JSON.stringify(content);
    this.markDirty(blockId);
    this.contentCache.set(blockId, serialized);
    this.notify();
  }

  /**
   * Record a content change for undo (e.g. when committing on blur or before structural ops).
   */
  recordContentChange(blockId: string, prevContent: string, prevType?: string) {
    const node = this.nodes.get(blockId);
    if (!node) return;
    const nextContent = this.getContent(blockId);
    this.pushCommand({ kind: "block-content-change", blockId, prevContent, prevType: prevType ?? node.type, nextContent, nextType: node.type });
  }

  /**
   * Create a new block. Returns the new block ID.
   */
  createBlock(opts: {
    id?: string;
    parentId?: string | null;
    sortRank: string;
    type?: string;
    content?: JsonValue;
  }): string {
    const blockId = opts.id ?? uuidv4();

    const node: BlockNode = {
      id: blockId,
      parentId: opts.parentId ?? null,
      sortRank: opts.sortRank,
      type: opts.type ?? "text",
      editorRef: null,
    };

    this.nodes.set(blockId, node);
    this.pendingCreates.add(blockId);
    const content = opts.content ?? { type: "doc", content: [{ type: "paragraph" }] };
    this.pendingInitialContent.set(blockId, content);

    const snapshot: BlockSnapshot = {
      id: blockId,
      parentId: node.parentId,
      sortRank: node.sortRank,
      type: node.type,
      content: serializeNoteDocument(content),
    };
    this.pushCommand({ kind: "block-create", blockId, snapshot });
    this.markStructureDirty();
    this.invalidateOrderCache();
    this.notify();

    return blockId;
  }

  /**
   * Create a block without recording an undo command (used internally for redo/restore).
   */
  private createBlockSilent(snapshot: BlockSnapshot) {
    const node: BlockNode = {
      id: snapshot.id,
      parentId: snapshot.parentId,
      sortRank: snapshot.sortRank,
      type: snapshot.type,
      editorRef: null,
    };
    this.nodes.set(snapshot.id, node);
    this.pendingCreates.add(snapshot.id);
    this.pendingInitialContent.set(snapshot.id, JSON.parse(snapshot.content));
    this.markStructureDirty();
    this.invalidateOrderCache();
  }

  /**
   * Delete a block.
   */
  deleteBlock(blockId: string) {
    const snap = this.snapshot(blockId);
    this.pushCommand({ kind: "block-delete", snapshot: snap });
    this.removeBlockInternal(blockId);
  }

  /**
   * Delete multiple blocks.
   */
  deleteBlockRange(blockIds: string[]) {
    const snapshots = blockIds.map((id) => this.snapshot(id));
    this.pushCommand({ kind: "block-delete-range", snapshots });
    for (const id of blockIds) {
      this.removeBlockInternal(id);
    }
  }

  private suppressNotify = false;

  private removeBlockInternal(blockId: string) {
    if (this.pendingCreates.has(blockId)) {
      // Never reached DB — just remove from pending
      this.pendingCreates.delete(blockId);
      this.pendingInitialContent.delete(blockId);
    } else {
      this.pendingDeletes.add(blockId);
    }
    this.nodes.delete(blockId);
    this.contentCache.delete(blockId);
    this.unmarkDirty(blockId);
    this.markStructureDirty();
    this.invalidateOrderCache();
    if (!this.suppressNotify) this.notify();
  }

  /**
   * Move a block to a new position.
   */
  moveBlock(blockId: string, newParentId: string | null, newSortRank: string) {
    const node = this.nodes.get(blockId)!;
    this.pushCommand({ kind: "block-move", blockId, prev: { parentId: node.parentId, sortRank: node.sortRank }, next: { parentId: newParentId, sortRank: newSortRank } });
    node.parentId = newParentId;
    node.sortRank = newSortRank;
    this.markDirty(blockId);
    this.invalidateOrderCache();
    this.notify();
  }

  /**
   * Move multiple blocks (e.g. shift-selected range move).
   */
  moveBlockRange(moves: { blockId: string; newParentId: string | null; newSortRank: string }[]) {
    const cmdMoves = moves.map((m) => {
      const node = this.nodes.get(m.blockId)!;
      return { blockId: m.blockId, prev: { parentId: node.parentId, sortRank: node.sortRank }, next: { parentId: m.newParentId, sortRank: m.newSortRank } };
    });
    this.pushCommand({ kind: "block-move-range", moves: cmdMoves });

    for (const m of moves) {
      const node = this.nodes.get(m.blockId)!;
      node.parentId = m.newParentId;
      node.sortRank = m.newSortRank;
      this.markDirty(m.blockId);
    }
    this.invalidateOrderCache();
    this.notify();
  }

  /**
   * Move a block without recording undo (used for child reparenting during structural ops).
   */
  moveBlockSilent(blockId: string, newParentId: string | null, newSortRank: string) {
    const node = this.nodes.get(blockId);
    if (!node) return;
    node.parentId = newParentId;
    node.sortRank = newSortRank;
    this.markDirty(blockId);
    this.invalidateOrderCache();
  }

  /**
   * Split a block at a cursor position.
   * Source editor keeps left content; new block gets right content.
   */
  splitBlock(opts: {
    sourceBlockId: string;
    newBlockId?: string;
    leftContent: JsonValue;
    rightContent: JsonValue;
    newSortRank: string;
    newParentId?: string | null;
  }): string {
    const { sourceBlockId, leftContent, rightContent, newSortRank, newParentId } = opts;
    const newBlockId = opts.newBlockId ?? uuidv4();
    const source = this.nodes.get(sourceBlockId)!;

    // Snapshot source before modification
    const prevSourceContent = this.getContent(sourceBlockId);

    this.pushCommand({
      kind: "block-split",
      sourceBlockId,
      newBlockId,
      prevSourceContent,
      leftContent: JSON.stringify(leftContent),
      rightContent: JSON.stringify(rightContent),
      newSortRank,
      newParentId: newParentId ?? source.parentId,
    });

    // Update source editor content
    source.editorRef?.commands.setContent(leftContent as any, { emitUpdate: false });
    this.markDirty(sourceBlockId);

    // Create the new block
    const newNode: BlockNode = {
      id: newBlockId,
      parentId: newParentId ?? source.parentId,
      sortRank: newSortRank,
      type: "text",
      editorRef: null,
    };
    this.nodes.set(newBlockId, newNode);
    this.pendingCreates.add(newBlockId);
    this.pendingInitialContent.set(newBlockId, rightContent);
    this.markStructureDirty();
    this.invalidateOrderCache();
    this.notify();

    return newBlockId;
  }

  /**
   * Merge a block into a target block (e.g. backspace at start merges into previous).
   */
  mergeBlocks(opts: {
    targetBlockId: string;
    deletedBlockId: string;
    mergedContent: JsonValue;
  }) {
    const { targetBlockId, deletedBlockId, mergedContent } = opts;

    const deletedSnapshot = this.snapshot(deletedBlockId);
    const prevTargetContent = this.getContent(targetBlockId);

    this.pushCommand({ kind: "block-merge", deletedSnapshot, targetBlockId, prevTargetContent, mergedContent: JSON.stringify(mergedContent) });

    // Update target with merged content
    const target = this.nodes.get(targetBlockId)!;
    target.editorRef?.commands.setContent(mergedContent as any, { emitUpdate: false });
    this.markDirty(targetBlockId);

    // Remove deleted block
    this.removeBlockInternal(deletedBlockId);
  }

  // ─── Undo / Redo ───────────────────────────────────────────────────────────

  protected applyUndo(cmd: NoteBlockCommand) {
    this.suppressNotify = true;
    try {
      this.applyUndoInner(cmd);
    } finally {
      this.suppressNotify = false;
    }
    this.notify();
  }

  private applyUndoInner(cmd: NoteBlockCommand) {
    switch (cmd.kind) {
      case "block-create": {
        // Undo create = remove the block
        this.removeBlockInternal(cmd.blockId);
        this.onBlockRemoved?.(cmd.blockId);
        break;
      }

      case "block-delete": {
        // Undo delete = recreate the block
        this.createBlockSilent(cmd.snapshot);
        break;
      }

      case "block-delete-range": {
        // Undo range delete = recreate all blocks
        for (const snap of cmd.snapshots) {
          this.createBlockSilent(snap);
        }
        break;
      }

      case "block-move": {
        // Undo move = move back
        const node = this.nodes.get(cmd.blockId);
        if (node) {
          node.parentId = cmd.prev.parentId;
          node.sortRank = cmd.prev.sortRank;
          this.markDirty(cmd.blockId);
          this.invalidateOrderCache();
        }
        break;
      }

      case "block-move-range": {
        for (const m of cmd.moves) {
          const node = this.nodes.get(m.blockId);
          if (node) {
            node.parentId = m.prev.parentId;
            node.sortRank = m.prev.sortRank;
            this.markDirty(m.blockId);
          }
        }
        this.invalidateOrderCache();
        break;
      }

      case "block-merge": {
        // Undo merge = recreate deleted block + restore target content
        this.createBlockSilent(cmd.deletedSnapshot);
        const target = this.nodes.get(cmd.targetBlockId);
        if (target?.editorRef) {
          target.editorRef.commands.setContent(JSON.parse(cmd.prevTargetContent) as any, { emitUpdate: false });
          this.markDirty(cmd.targetBlockId);
        }
        this.onContentRestored?.(cmd.targetBlockId, cmd.prevTargetContent);
        break;
      }

      case "block-split": {
        // Undo split = remove new block + restore source content
        this.removeBlockInternal(cmd.newBlockId);
        this.onBlockRemoved?.(cmd.newBlockId);
        const source = this.nodes.get(cmd.sourceBlockId);
        if (source?.editorRef) {
          source.editorRef.commands.setContent(JSON.parse(cmd.prevSourceContent) as any, { emitUpdate: false });
          this.markDirty(cmd.sourceBlockId);
        }
        this.onContentRestored?.(cmd.sourceBlockId, cmd.prevSourceContent);
        break;
      }

      case "block-content-change": {
        const node = this.nodes.get(cmd.blockId);
        if (node) {
          if (node.editorRef) {
            node.editorRef.commands.setContent(JSON.parse(cmd.prevContent) as any, { emitUpdate: false });
          }
          node.type = cmd.prevType;
          this.markDirty(cmd.blockId);
        }
        this.onContentRestored?.(cmd.blockId, cmd.prevContent);
        break;
      }

      case "batch": {
        // Apply in reverse order
        for (let i = cmd.commands.length - 1; i >= 0; i--) {
          this.applyUndoInner(cmd.commands[i]);
        }
        break;
      }
    }
  }

  protected applyRedo(cmd: NoteBlockCommand) {
    this.suppressNotify = true;
    try {
      this.applyRedoInner(cmd);
    } finally {
      this.suppressNotify = false;
    }
    this.notify();
  }

  private applyRedoInner(cmd: NoteBlockCommand) {
    switch (cmd.kind) {
      case "block-create": {
        // Redo create — recreate from the stored snapshot
        if (!this.nodes.has(cmd.blockId)) {
          this.createBlockSilent(cmd.snapshot);
        }
        break;
      }

      case "block-delete": {
        // Redo delete = remove again
        this.removeBlockInternal(cmd.snapshot.id);
        this.onBlockRemoved?.(cmd.snapshot.id);
        break;
      }

      case "block-delete-range": {
        for (const snap of cmd.snapshots) {
          this.removeBlockInternal(snap.id);
          this.onBlockRemoved?.(snap.id);
        }
        break;
      }

      case "block-move": {
        const node = this.nodes.get(cmd.blockId);
        if (node) {
          node.parentId = cmd.next.parentId;
          node.sortRank = cmd.next.sortRank;
          this.markDirty(cmd.blockId);
          this.invalidateOrderCache();
        }
        break;
      }

      case "block-move-range": {
        for (const m of cmd.moves) {
          const node = this.nodes.get(m.blockId);
          if (node) {
            node.parentId = m.next.parentId;
            node.sortRank = m.next.sortRank;
            this.markDirty(m.blockId);
          }
        }
        this.invalidateOrderCache();
        break;
      }

      case "block-merge": {
        // Redo merge = apply merged content to target + re-delete the block
        const mergeTarget = this.nodes.get(cmd.targetBlockId);
        if (mergeTarget?.editorRef) {
          mergeTarget.editorRef.commands.setContent(JSON.parse(cmd.mergedContent) as any, { emitUpdate: false });
          this.markDirty(cmd.targetBlockId);
        }
        if (this.nodes.has(cmd.deletedSnapshot.id)) {
          this.removeBlockInternal(cmd.deletedSnapshot.id);
          this.onBlockRemoved?.(cmd.deletedSnapshot.id);
        }
        break;
      }

      case "block-split": {
        // Redo split = re-apply the split
        const redoSource = this.nodes.get(cmd.sourceBlockId);
        if (redoSource?.editorRef) {
          redoSource.editorRef.commands.setContent(JSON.parse(cmd.leftContent) as any, { emitUpdate: false });
          this.markDirty(cmd.sourceBlockId);
        }
        if (!this.nodes.has(cmd.newBlockId)) {
          this.nodes.set(cmd.newBlockId, {
            id: cmd.newBlockId,
            parentId: cmd.newParentId,
            sortRank: cmd.newSortRank,
            type: "text",
            editorRef: null,
          });
          this.pendingCreates.add(cmd.newBlockId);
          this.pendingInitialContent.set(cmd.newBlockId, JSON.parse(cmd.rightContent));
          this.markStructureDirty();
          this.invalidateOrderCache();
        }
        break;
      }

      case "block-content-change": {
        const node = this.nodes.get(cmd.blockId);
        if (node) {
          if (node.editorRef) {
            node.editorRef.commands.setContent(JSON.parse(cmd.nextContent) as any, { emitUpdate: false });
          }
          node.type = cmd.nextType;
          this.markDirty(cmd.blockId);
        }
        this.onContentRestored?.(cmd.blockId, cmd.nextContent);
        break;
      }

      case "batch": {
        for (const sub of cmd.commands) {
          this.applyRedoInner(sub);
        }
        break;
      }
    }
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  protected async flushDirtyEntities(dirtyIds: Set<string>) {
    if (dirtyIds.size === 0) return;

    // Track blocks being flushed so reconcileNode doesn't overwrite during the async write
    for (const id of dirtyIds) this.flushingIds.add(id);

    try {
      await db.writeTransaction(async (tx) => {
        for (const blockId of dirtyIds) {
          const node = this.nodes.get(blockId);
          if (!node) continue;

          const content = this.getContent(blockId);

          await tx.execute(
            `UPDATE blocks SET content = ?, type = ?, parent_block_id = ?, sort_rank = ?, updated_at = ${SQL_UTC_NOW} WHERE id = ?`,
            [content, node.type, node.parentId, node.sortRank, blockId]
          );

          // Reconcile [[page references]] and #tags in the edges table
          await reconcileNoteBlockEdges(blockId, JSON.parse(content), tx);
        }
      });
    } finally {
      for (const id of dirtyIds) this.flushingIds.delete(id);
    }
  }

  protected async flushStructure() {
    const userId = await getCurrentUserId();

    await db.writeTransaction(async (tx) => {
      // Flush creates (only blocks that still exist in the tree)
      for (const blockId of this.pendingCreates) {
        const node = this.nodes.get(blockId);
        if (!node) {
          // Created and deleted within the debounce window — net zero, skip
          continue;
        }

        const content = this.getContent(blockId);

        await tx.execute(
          `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ${SQL_UTC_NOW})`,
          [blockId, userId, this.pageId, node.parentId, node.type, content, node.sortRank]
        );

        await reconcileNoteBlockEdges(blockId, JSON.parse(content), tx);
      }

      // Flush deletes
      for (const blockId of this.pendingDeletes) {
        await tx.execute(`DELETE FROM edges WHERE source_block_id = ?`, [blockId]);
        await tx.execute(`DELETE FROM blocks WHERE id = ?`, [blockId]);
      }
    });

    this.pendingCreates.clear();
    // Only clear initial content for blocks that were just created (not remote blocks pending editor mount)
    for (const blockId of [...this.pendingInitialContent.keys()]) {
      if (!this.nodes.has(blockId) || this.nodes.get(blockId)!.editorRef) {
        this.pendingInitialContent.delete(blockId);
      }
    }
    this.pendingDeletes.clear();
  }

  // ─── Reconcile (PowerSync) ──────────────────────────────────────────────────

  protected reconcileNode(row: BlockRow) {
    // Skip blocks pending local deletion (undo removed it, but DB hasn't flushed yet)
    if (this.pendingDeletes.has(row.id)) return;

    const node = this.nodes.get(row.id);
    if (!node) {
      // Remote created a new block
      this.nodes.set(row.id, {
        id: row.id,
        parentId: row.parent_block_id,
        sortRank: row.sort_rank,
        type: row.type,
        editorRef: null,
      });
      this.pendingInitialContent.set(row.id, normalizeNoteDocument(row.content) as JsonValue);
      this.invalidateOrderCache();
      return;
    }

    // Update metadata only if not locally dirty (local state wins until flushed)
    if (!this.hasPendingWrites(row.id) && !this.flushingIds.has(row.id)) {
      const structChanged = node.parentId !== row.parent_block_id || node.sortRank !== row.sort_rank;
      node.parentId = row.parent_block_id;
      node.sortRank = row.sort_rank;
      node.type = row.type;
      if (structChanged) this.invalidateOrderCache();

      // Fast path: if raw DB string matches our cached normalized content, skip expensive normalization
      const cached = this.contentCache.get(row.id);
      if (cached && row.content === cached) return;

      if (node.editorRef) {
        // Normalize remote content to canonical form (handles double-encoding, whitespace, missing attrs)
        const remoteNormalized = serializeNoteDocument(normalizeNoteDocument(row.content));
        const currentContent = serializeNoteDocument(node.editorRef.getJSON());
        if (currentContent !== remoteNormalized) {
          node.editorRef.commands.setContent(JSON.parse(remoteNormalized) as any, { emitUpdate: false });
          this.contentCache.set(row.id, remoteNormalized);
        }
      } else {
        // No editor mounted (e.g. query block) — use raw content, no normalization
        if (!cached) {
          // No local state — accept remote content
          this.pendingInitialContent.set(row.id, JSON.parse(row.content));
          this.contentCache.set(row.id, row.content);
        } else {
          // Local cache exists but differs from DB — genuine remote change, accept it
          this.contentCache.set(row.id, row.content);
          this.notify();
        }
      }
    }
  }

  protected onRemoteDelete(id: string) {
    this.nodes.delete(id);
    this.invalidateOrderCache();
    this.onBlockRemoved?.(id);
  }

  protected isPendingCreate(id: string): boolean {
    return this.pendingCreates.has(id);
  }

  // ─── Query helpers ──────────────────────────────────────────────────────────

  /** Get all blocks sorted by sort_rank. */
  getOrderedBlocks(): BlockNode[] {
    if (!this.orderedBlocksCache) {
      this.orderedBlocksCache = [...this.nodes.values()].sort((a, b) => a.sortRank.localeCompare(b.sortRank));
    }
    return this.orderedBlocksCache;
  }

  private invalidateOrderCache() {
    this.orderedBlocksCache = null;
  }

  /** Get a single block node. */
  getBlock(id: string): BlockNode | undefined {
    return this.nodes.get(id);
  }

  /** Get children of a parent (null = root blocks), sorted. */
  getChildren(parentId: string | null): BlockNode[] {
    return this.getOrderedBlocks().filter((n) => n.parentId === parentId);
  }

  /** Get the total block count. */
  get blockCount(): number {
    return this.nodes.size;
  }

  /** Check if a block exists in the store. */
  has(blockId: string): boolean {
    return this.nodes.has(blockId);
  }
}

// ─── Store registry (one per page, survives component re-mounts) ──────────────

const storesByPage = new Map<string, NoteBlockStore>();

export function getNoteBlockStore(pageId: string, config?: NoteBlockStoreConfig): NoteBlockStore {
  let store = storesByPage.get(pageId);
  if (!store) {
    store = new NoteBlockStore(pageId, config);
    storesByPage.set(pageId, store);
  }
  return store;
}

export function disposeNoteBlockStore(pageId: string) {
  const store = storesByPage.get(pageId);
  if (store) {
    void store.flush();
    store.dispose();
    storesByPage.delete(pageId);
  }
}

/** Flush all active block stores (e.g. before page unload). */
export function flushAllNoteBlockStores() {
  for (const store of storesByPage.values()) {
    void store.flush();
  }
}
