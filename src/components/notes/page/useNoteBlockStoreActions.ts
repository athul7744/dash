"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { NoteBlockRow } from "@/hooks/use-notes";
import { mergeNoteDocuments, getNoteDocumentEndSelection, serializeNoteDocument } from "@/lib/notes/notes-content";
import {
  getDeleteChildMoves,
  getDeleteFocusTarget,
  getIndentPosition,
  getBlockRangeMovePlan,
  getMergeChildMoves,
  getMergePlan,
  getOutdentPosition,
  type BlockRangeMoveDirection,
} from "@/lib/notes/block-editor-structure";
import { getVisibleNoteBlockIds } from "@/lib/notes/notes-tree";
import { getRankAfterItem, getRankAtParentEnd, getRankBeforeItem } from "@/lib/shared/ranked-order";
import { getNoteBlockStore, disposeNoteBlockStore, type BlockStoreHydrationRow, type JsonValue, type NoteBlockStore } from "@/lib/notes/note-block-store";

import type { NoteBlockInsert } from "@/lib/notes/notes";

// ─── Types ────────────────────────────────────────────────────────────────────

type FocusTarget = { blockId: string; placement: number | "start" | "end" } | null;

/** Shape expected by structure helpers (getIndentPosition, etc.) */
type BlockStructureItem = { id: string; parent_block_id: string | null; sort_rank: string };

export interface UseNoteBlockStoreActionsParams {
  pageId: string;
  /** Blocks from the PowerSync reactive query. Used for hydration + reconcile. */
  selectedBlocks: NoteBlockRow[];
}

export interface NoteBlockStoreActionsResult {
  store: NoteBlockStore;
  /** Blocks formatted as NoteBlockRow for display (content from editors). */
  displayBlocks: NoteBlockRow[];
  /** Ordered visible block IDs (respects tree depth-first ordering). */
  orderedVisibleBlockIds: string[];
  /** Block lookup by ID. */
  blockMap: Map<string, NoteBlockRow>;
  /** Focus target (UI concern). */
  focusTarget: FocusTarget;
  setFocusTarget: (target: FocusTarget) => void;
  /** Undo / redo state. */
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  // ─── Block action callbacks ─────────────────────────────────────────────
  handleCreateRootBlock: () => void;
  handleCreateSiblingBlock: (
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: JsonValue,
    nextSiblingContent?: JsonValue,
    options?: { focusPlacement?: "start" | "end"; focusTarget?: "created" | "current"; insertionSide?: "before" | "after" },
  ) => void;
  handleCreateEmptySiblingBlock: (blockId: string, parentBlockId: string | null | undefined) => void;
  handleCreateSiblingBlocks: (
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: NoteBlockInsert,
    nextSiblingContents: NoteBlockInsert[],
  ) => void;
  handleMergeWithPreviousBlock: (blockId: string, previousBlockId: string, nextContent: JsonValue, options?: { hasChildren?: boolean }) => void;
  handleCommitBlockContent: (blockId: string, nextContent: JsonValue) => void;
  handleUpdateBlockContent: (blockId: string, nextContent: JsonValue) => void;
  handleIndentBlock: (blockId: string, nextParentBlockId: string) => void;
  handleOutdentBlock: (blockId: string, nextParentBlockId?: string | null) => void;
  handleMoveSelectedBlockRange: (blockIds: string[], direction: BlockRangeMoveDirection, focusBlockId: string) => void;
  handleDeleteBlock: (blockId: string) => void;
  handleDeleteBlockRange: (blockIds: string[]) => void;
  handleConvertBlockType: (blockId: string, blockType: string, content: unknown) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNoteBlockStoreActions({
  pageId,
  selectedBlocks,
}: UseNoteBlockStoreActionsParams): NoteBlockStoreActionsResult {
  const store = useMemo(() => getNoteBlockStore(pageId), [pageId]);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);

  // ─── Hydration / reconcile from PowerSync ─────────────────────────────────
  const hydratedPageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedPageIdRef.current !== pageId) {
      // First hydration for this page
      const rows: BlockStoreHydrationRow[] = selectedBlocks.map((b) => ({
        id: b.id,
        page_id: b.page_id ?? pageId,
        parent_block_id: b.parent_block_id ?? null,
        sort_rank: b.sort_rank ?? "",
        type: b.type ?? "text",
        content: b.content ?? "{}",
      }));
      store.hydrate(rows);
      hydratedPageIdRef.current = pageId;
    } else {
      // Subsequent updates: reconcile
      store.reconcile(selectedBlocks.map((b) => ({
        id: b.id,
        page_id: b.page_id ?? pageId,
        parent_block_id: b.parent_block_id ?? null,
        sort_rank: b.sort_rank ?? "",
        type: b.type ?? "text",
        content: b.content ?? "{}",
      })));
    }
  }, [store, selectedBlocks, pageId]);

  // Dispose store on page switch or unmount
  useEffect(() => {
    return () => {
      disposeNoteBlockStore(pageId);
    };
  }, [pageId]);

  // ─── Reactive subscription ────────────────────────────────────────────────
  const subscribe = useCallback((fn: () => void) => store.subscribe(fn), [store]);
  const getSnapshot = useCallback(() => store.version, [store]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // ─── Derived state ────────────────────────────────────────────────────────
  const structuredItems: BlockStructureItem[] = useMemo(() => {
    return store.getOrderedBlocks().map((n) => ({
      id: n.id,
      parent_block_id: n.parentId,
      sort_rank: n.sortRank,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, store.version]);

  const orderedVisibleBlockIds = useMemo(
    () => getVisibleNoteBlockIds(structuredItems),
    [structuredItems],
  );

  const displayBlocks: NoteBlockRow[] = useMemo(() => {
    return store.getOrderedBlocks().map((node) => ({
      id: node.id,
      user_id: "",
      page_id: pageId,
      parent_block_id: node.parentId,
      type: node.type,
      content: store.getContent(node.id),
      sort_rank: node.sortRank,
      updated_at: null,
    })) as NoteBlockRow[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, store.version, pageId]);

  const blockMap = useMemo(
    () => new Map(displayBlocks.map((b) => [b.id, b])),
    [displayBlocks],
  );

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const getSortRankAfterBlock = (blockId: string, parentBlockId: string | null | undefined) => {
    return getRankAfterItem(structuredItems, blockId, parentBlockId ?? null, (b) => b.parent_block_id);
  };

  const getSortRankAtParentEnd = (parentId: string | null) => {
    return getRankAtParentEnd(structuredItems, parentId, (b) => b.parent_block_id);
  };

  const createBlockDocument = (): JsonValue => ({ type: "doc", content: [{ type: "paragraph" }] });

  // ─── Block actions ────────────────────────────────────────────────────────

  const handleCreateRootBlock = useCallback(() => {
    const sortRank = getSortRankAtParentEnd(null);
    const blockId = store.createBlock({ sortRank, content: createBlockDocument() });
    setFocusTarget({ blockId, placement: "end" });
  }, [store, structuredItems]);

  const handleCreateSiblingBlock = useCallback((
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: JsonValue,
    nextSiblingContent?: JsonValue,
    options?: { focusPlacement?: "start" | "end"; focusTarget?: "created" | "current"; insertionSide?: "before" | "after" },
  ) => {
    const focusPlacement = options?.focusPlacement ?? "end";
    const focusTargetMode = options?.focusTarget ?? "created";
    const insertionSide = options?.insertionSide ?? "after";
    const parentId = parentBlockId ?? null;

    // Compute sort rank for new block
    const nextSortRank = insertionSide === "before"
      ? getRankBeforeItem(structuredItems, blockId, parentId, (b) => b.parent_block_id)
      : getSortRankAfterBlock(blockId, parentId);

    // Split: source keeps leftContent, new block gets rightContent
    const newBlockId = store.splitBlock({
      sourceBlockId: blockId,
      leftContent: nextContent,
      rightContent: nextSiblingContent ?? createBlockDocument(),
      newSortRank: nextSortRank,
      newParentId: parentId,
    });

    setFocusTarget({
      blockId: focusTargetMode === "current" ? blockId : newBlockId,
      placement: focusPlacement,
    });
  }, [store, structuredItems]);

  const handleCreateEmptySiblingBlock = useCallback((
    blockId: string,
    parentBlockId: string | null | undefined,
  ) => {
    const parentId = parentBlockId ?? null;
    const nextSortRank = getSortRankAfterBlock(blockId, parentId);
    const newBlockId = store.createBlock({ parentId, sortRank: nextSortRank, content: createBlockDocument() });
    setFocusTarget({ blockId: newBlockId, placement: "end" });
  }, [store, structuredItems]);

  const handleCreateSiblingBlocks = useCallback((
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: NoteBlockInsert,
    nextSiblingContents: NoteBlockInsert[],
  ) => {
    const parentId = parentBlockId ?? null;

    // Update source block content
    const sourceNode = store.getBlock(blockId);
    if (sourceNode?.editorRef) {
      sourceNode.editorRef.commands.setContent(nextContent.content as any, { emitUpdate: false });
      store.commitContent(blockId);
    }

    // Collect all blocks to insert in order using working set for rank computation
    const insertedItems: BlockStructureItem[] = [...structuredItems];
    let lastCreatedBlockId: string | null = null;

    const createInsertedBlocks = (
      blocksToCreate: NoteBlockInsert[],
      nextParentId: string | null,
      previousSiblingId?: string | null,
    ): string | null => {
      let currentPrevSibling = previousSiblingId ?? null;
      let lastId: string | null = null;

      for (const block of blocksToCreate) {
        const nextSortRank = currentPrevSibling
          ? getRankAfterItem(insertedItems, currentPrevSibling, nextParentId, (b) => b.parent_block_id)
          : getRankAtParentEnd(insertedItems, nextParentId, (b) => b.parent_block_id);

        const newId = store.createBlock({
          parentId: nextParentId,
          sortRank: nextSortRank,
          content: block.content,
        });

        insertedItems.push({ id: newId, parent_block_id: nextParentId, sort_rank: nextSortRank });
        currentPrevSibling = newId;
        lastId = newId;

        if (block.children && block.children.length > 0) {
          const childLastId = createInsertedBlocks(block.children, newId);
          if (childLastId) lastId = childLastId;
        }
      }

      return lastId;
    };

    // Create children of the current block
    if (nextContent.children && nextContent.children.length > 0) {
      lastCreatedBlockId = createInsertedBlocks(nextContent.children, blockId) ?? lastCreatedBlockId;
    }

    // Create siblings after the current block
    if (nextSiblingContents.length > 0) {
      lastCreatedBlockId = createInsertedBlocks(nextSiblingContents, parentId, blockId) ?? lastCreatedBlockId;
    }

    if (lastCreatedBlockId) {
      setFocusTarget({ blockId: lastCreatedBlockId, placement: "end" });
    }
  }, [store, structuredItems]);

  const handleMergeWithPreviousBlock = useCallback((
    blockId: string,
    previousBlockId: string,
    nextContent: JsonValue,
    options?: { hasChildren?: boolean },
  ) => {
    const prevBlock = store.getBlock(previousBlockId);
    if (!prevBlock) return;

    const prevBlockContent = store.getContent(previousBlockId);
    const mergedContent = mergeNoteDocuments(prevBlockContent, nextContent) as JsonValue;
    const joinPlacement = getNoteDocumentEndSelection(prevBlockContent);
    const mergePlan = getMergePlan(blockId, previousBlockId, joinPlacement);

    // Handle children of the deleted block
    const childMoves = options?.hasChildren
      ? getMergeChildMoves(structuredItems, blockId, mergePlan.updatedBlockId)
      : [];

    // Move children first
    for (const move of childMoves) {
      store.moveBlockSilent(move.blockId, move.parentBlockId, move.sortRank);
    }

    // Perform the merge
    store.mergeBlocks({
      targetBlockId: previousBlockId,
      deletedBlockId: mergePlan.deletedBlockId,
      mergedContent,
    });

    setFocusTarget(mergePlan.focusTarget);
  }, [store, structuredItems]);

  const handleCommitBlockContent = useCallback((blockId: string, _nextContent: JsonValue) => {
    // Content lives in the Tiptap editor — just mark dirty to trigger persist
    store.commitContent(blockId);
  }, [store]);

  const handleUpdateBlockContent = useCallback((blockId: string, nextContent: JsonValue) => {
    // For non-text blocks or programmatic content updates
    const node = store.getBlock(blockId);
    if (node?.editorRef) {
      const currentContent = node.editorRef.getJSON();
      if (serializeNoteDocument(currentContent) === serializeNoteDocument(nextContent)) {
        store.commitContent(blockId);
        return;
      }

      store.setEditorContent(blockId, nextContent);
    } else {
      // Non-editor blocks (e.g. query): store content directly
      store.setContentDirect(blockId, nextContent);
    }
  }, [store]);

  const handleIndentBlock = useCallback((blockId: string, nextParentBlockId: string) => {
    const nextPosition = getIndentPosition(structuredItems, blockId, nextParentBlockId);
    store.moveBlock(blockId, nextPosition.parentBlockId, nextPosition.sortRank);
    setFocusTarget({ blockId, placement: "start" });
  }, [store, structuredItems]);

  const handleOutdentBlock = useCallback((blockId: string, nextParentBlockId?: string | null) => {
    const nextPosition = getOutdentPosition(structuredItems, blockId, nextParentBlockId);
    store.moveBlock(blockId, nextPosition.parentBlockId, nextPosition.sortRank);
    setFocusTarget({ blockId, placement: "start" });
  }, [store, structuredItems]);

  const handleMoveSelectedBlockRange = useCallback((
    blockIds: string[],
    direction: BlockRangeMoveDirection,
    focusBlockId: string,
  ) => {
    const moves = getBlockRangeMovePlan(structuredItems, blockIds, direction);
    if (moves.length === 0) return;

    store.moveBlockRange(moves.map((m) => ({
      blockId: m.blockId,
      newParentId: m.parentBlockId,
      newSortRank: m.sortRank,
    })));

    setFocusTarget({ blockId: focusBlockId, placement: "start" });
  }, [store, structuredItems]);

  const handleDeleteBlock = useCallback((blockId: string) => {
    const childMoves = getDeleteChildMoves(structuredItems, blockId);

    // Reparent children before deleting
    for (const move of childMoves) {
      store.moveBlockSilent(move.blockId, move.parentBlockId, move.sortRank);
    }

    const nextFocusTarget = getDeleteFocusTarget(orderedVisibleBlockIds, blockId);
    store.deleteBlock(blockId);
    setFocusTarget(nextFocusTarget);
  }, [store, structuredItems, orderedVisibleBlockIds]);

  const handleDeleteBlockRange = useCallback((blockIds: string[]) => {
    // Get focus target before deleting
    const firstBlockId = blockIds[0];
    const nextFocusTarget = firstBlockId ? getDeleteFocusTarget(orderedVisibleBlockIds, firstBlockId) : null;

    store.deleteBlockRange(blockIds);
    if (nextFocusTarget) setFocusTarget(nextFocusTarget);
  }, [store, orderedVisibleBlockIds]);

  const handleConvertBlockType = useCallback((blockId: string, blockType: string, content: unknown) => {
    const node = store.getBlock(blockId);
    if (!node) return;

    const prevContent = store.getContent(blockId);
    const prevType = node.type;

    store.setBlockType(blockId, blockType);

    // The source block may still hold a live text editor ref during conversion.
    // Query blocks render without an editor, so detach the ref and write the
    // encoded document straight to the store — routing it through the text editor
    // would drop the queryBlock node it doesn't recognize. Editor-backed targets
    // apply content through the editor so the mounted instance updates in place.
    if (blockType === "query") {
      store.setEditorRef(blockId, null);
      store.setContentDirect(blockId, content as JsonValue);
    } else if (node.editorRef) {
      node.editorRef.commands.setContent(content as any, { emitUpdate: false });
      store.commitContent(blockId);
    }

    store.recordContentChange(blockId, prevContent, prevType);
  }, [store]);

  return {
    store,
    displayBlocks,
    orderedVisibleBlockIds,
    blockMap,
    focusTarget,
    setFocusTarget,
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    undo: () => store.undo(),
    redo: () => store.redo(),
    handleCreateRootBlock,
    handleCreateSiblingBlock,
    handleCreateEmptySiblingBlock,
    handleCreateSiblingBlocks,
    handleMergeWithPreviousBlock,
    handleCommitBlockContent,
    handleUpdateBlockContent,
    handleIndentBlock,
    handleOutdentBlock,
    handleMoveSelectedBlockRange,
    handleDeleteBlock,
    handleDeleteBlockRange,
    handleConvertBlockType,
  };
}
