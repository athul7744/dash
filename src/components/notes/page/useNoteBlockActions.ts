"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { v4 as uuidv4 } from "uuid";

import type { NoteBlockRow } from "@/hooks/use-notes";
import { getNoteDocumentEndSelection, mergeNoteDocuments, normalizeNoteDocument, serializeNoteDocument } from "@/lib/notes/notes-content";
import {
  createNoteBlock,
  deleteNoteBlock,
  moveNoteBlock,
  queueNoteBlockCreate,
  queueNoteBlockCreates,
  updateNoteBlock,
  type JsonValue,
  type NoteBlockInsert,
} from "@/lib/notes/notes";
import { getVisibleNoteBlockIds } from "@/lib/notes/notes-tree";
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
import { flushUpdate } from "@/lib/shared/debounced-update";
import { getRankAfterItem, getRankAtParentEnd, getRankBeforeItem } from "@/lib/shared/ranked-order";

import type { OptimisticBlockStructure } from "./types";
import { createBlockDocument } from "./utils";

type FocusTarget = { blockId: string; placement: number | "start" | "end" } | null;

type UseNoteBlockActionsParams = {
  selectedBlocks: NoteBlockRow[];
  selectedPageId: string | null;
  selectedPageIdForWrite: string | undefined;
  isCreatingBlock: boolean;
  currentFocusTarget: FocusTarget;
  blockContentDrafts: Record<string, string>;
  optimisticBlockStructure: Record<string, OptimisticBlockStructure>;
  setIsCreatingBlock: Dispatch<SetStateAction<boolean>>;
  setBlockContentDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setOptimisticBlockStructure: Dispatch<SetStateAction<Record<string, OptimisticBlockStructure>>>;
  setFocusTarget: Dispatch<SetStateAction<FocusTarget>>;
};

export function useNoteBlockActions({
  selectedBlocks,
  selectedPageId,
  selectedPageIdForWrite,
  isCreatingBlock,
  currentFocusTarget,
  blockContentDrafts,
  optimisticBlockStructure,
  setIsCreatingBlock,
  setBlockContentDrafts,
  setOptimisticBlockStructure,
  setFocusTarget,
}: UseNoteBlockActionsParams) {
  const [optimisticCreatedBlocks, setOptimisticCreatedBlocks] = useState<Record<string, NoteBlockRow>>({});
  const [optimisticDeletedBlockIds, setOptimisticDeletedBlockIds] = useState<Record<string, true>>({});

  const applyDraftContent = (block: NoteBlockRow) => {
    const draftContent = blockContentDrafts[block.id];
    return draftContent ? { ...block, content: draftContent } : block;
  };

  useEffect(() => {
    const selectedBlockIds = new Set(selectedBlocks.map((block) => block.id));

    setOptimisticCreatedBlocks((currentBlocks) => {
      let hasChanges = false;
      const nextBlocks = { ...currentBlocks };

      for (const blockId of Object.keys(currentBlocks)) {
        if (!selectedBlockIds.has(blockId)) {
          continue;
        }

        delete nextBlocks[blockId];
        hasChanges = true;
      }

      return hasChanges ? nextBlocks : currentBlocks;
    });

    setOptimisticDeletedBlockIds((currentIds) => {
      let hasChanges = false;
      const nextIds = { ...currentIds };

      for (const blockId of Object.keys(currentIds)) {
        if (selectedBlockIds.has(blockId)) {
          continue;
        }

        delete nextIds[blockId];
        hasChanges = true;
      }

      return hasChanges ? nextIds : currentIds;
    });
  }, [selectedBlocks]);

  const structuredBlocks = useMemo(
    () => {
      const mergedBlocks = new Map<string, NoteBlockRow>();

      selectedBlocks.forEach((block) => {
        if (optimisticDeletedBlockIds[block.id]) {
          return;
        }

        const optimisticStructure = optimisticBlockStructure[block.id];
        mergedBlocks.set(
          block.id,
          applyDraftContent(
            optimisticStructure
              ? {
                  ...block,
                  parent_block_id: optimisticStructure.parent_block_id,
                  sort_rank: optimisticStructure.sort_rank,
                }
              : block
          )
        );
      });

      Object.values(optimisticCreatedBlocks).forEach((block) => {
        if (optimisticDeletedBlockIds[block.id] || mergedBlocks.has(block.id)) {
          return;
        }

        const optimisticStructure = optimisticBlockStructure[block.id];
        mergedBlocks.set(
          block.id,
          applyDraftContent(
            optimisticStructure
              ? {
                  ...block,
                  parent_block_id: optimisticStructure.parent_block_id,
                  sort_rank: optimisticStructure.sort_rank,
                }
              : block
          )
        );
      });

      return [...mergedBlocks.values()].sort((left, right) => (left.sort_rank ?? "").localeCompare(right.sort_rank ?? ""));
    },
    [blockContentDrafts, optimisticBlockStructure, optimisticCreatedBlocks, optimisticDeletedBlockIds, selectedBlocks]
  );

  const selectedBlockMap = useMemo(
    () => new Map(structuredBlocks.map((block) => [block.id, block])),
    [structuredBlocks]
  );
  const persistedSelectedBlockIds = useMemo(
    () => new Set(selectedBlocks.map((block) => block.id)),
    [selectedBlocks]
  );

  const orderedVisibleBlockIds = useMemo(
    () => getVisibleNoteBlockIds(structuredBlocks),
    [structuredBlocks]
  );

  const getSortRankAtParentEnd = (parentBlockId: string | null | undefined, excludeBlockId?: string) => {
    return getRankAtParentEnd(structuredBlocks, parentBlockId, (block) => block.parent_block_id, excludeBlockId);
  };

  const getSortRankAfterBlock = (
    siblingBlockId: string,
    parentBlockId: string | null | undefined,
    excludeBlockId?: string
  ) => {
    return getRankAfterItem(structuredBlocks, siblingBlockId, parentBlockId, (block) => block.parent_block_id, excludeBlockId);
  };

  const applyOptimisticBlockMove = (blockId: string, parentBlockId: string | null, sortRank: string) => {
    setOptimisticBlockStructure((current) => ({
      ...current,
      [blockId]: {
        parent_block_id: parentBlockId,
        sort_rank: sortRank,
      },
    }));
  };

  const createOptimisticBlock = (
    blockId: string,
    parentBlockId: string | null | undefined,
    sortRank: string,
    content: JsonValue,
    pageId: string
  ) => {
    const fallbackBlock = selectedBlockMap.get(parentBlockId ?? "")
      ?? structuredBlocks.find((block) => block.page_id === pageId)
      ?? selectedBlocks[0]
      ?? null;

    const optimisticBlock: NoteBlockRow = {
      id: blockId,
      user_id: fallbackBlock?.user_id ?? "",
      page_id: pageId,
      parent_block_id: parentBlockId ?? null,
      type: "text",
      content: serializeNoteDocument(content),
      sort_rank: sortRank,
      updated_at: new Date().toISOString(),
    };

    setOptimisticCreatedBlocks((currentBlocks) => ({
      ...currentBlocks,
      [blockId]: optimisticBlock,
    }));
  };

  const createOptimisticBlocks = (
    blocks: Array<{
      blockId: string;
      parentBlockId: string | null | undefined;
      sortRank: string;
      content: JsonValue;
      pageId: string;
    }>
  ) => {
    if (blocks.length === 0) {
      return;
    }

    const fallbackBlock = blocks
      .map((block) => selectedBlockMap.get(block.parentBlockId ?? "") ?? structuredBlocks.find((candidate) => candidate.page_id === block.pageId) ?? selectedBlocks[0] ?? null)
      .find((block) => block !== null) ?? null;

    setOptimisticCreatedBlocks((currentBlocks) => {
      const nextBlocks = { ...currentBlocks };

      blocks.forEach((block) => {
        nextBlocks[block.blockId] = {
          id: block.blockId,
          user_id: fallbackBlock?.user_id ?? "",
          page_id: block.pageId,
          parent_block_id: block.parentBlockId ?? null,
          type: "text",
          content: serializeNoteDocument(block.content),
          sort_rank: block.sortRank,
          updated_at: new Date().toISOString(),
        };
      });

      return nextBlocks;
    });
  };

  const removeOptimisticCreatedBlock = (blockId: string) => {
    setOptimisticCreatedBlocks((currentBlocks) => {
      if (!(blockId in currentBlocks)) {
        return currentBlocks;
      }

      const nextBlocks = { ...currentBlocks };
      delete nextBlocks[blockId];
      return nextBlocks;
    });
  };

  const removeOptimisticCreatedBlocks = (blockIds: string[]) => {
    if (blockIds.length === 0) {
      return;
    }

    setOptimisticCreatedBlocks((currentBlocks) => {
      let hasChanges = false;
      const nextBlocks = { ...currentBlocks };

      blockIds.forEach((blockId) => {
        if (!(blockId in nextBlocks)) {
          return;
        }

        delete nextBlocks[blockId];
        hasChanges = true;
      });

      return hasChanges ? nextBlocks : currentBlocks;
    });
  };

  const hideOptimisticBlock = (blockId: string) => {
    setOptimisticDeletedBlockIds((currentIds) => ({
      ...currentIds,
      [blockId]: true,
    }));
  };

  const restoreOptimisticBlock = (blockId: string) => {
    setOptimisticDeletedBlockIds((currentIds) => {
      if (!(blockId in currentIds)) {
        return currentIds;
      }

      const nextIds = { ...currentIds };
      delete nextIds[blockId];
      return nextIds;
    });
  };

  const restoreOptimisticBlockMoves = (entries: Array<{ blockId: string; structure: OptimisticBlockStructure | undefined }>) => {
    if (entries.length === 0) {
      return;
    }

    setOptimisticBlockStructure((current) => {
      let hasChanges = false;
      const next = { ...current };

      entries.forEach(({ blockId, structure }) => {
        if (structure) {
          if (
            next[blockId]?.parent_block_id === structure.parent_block_id
            && next[blockId]?.sort_rank === structure.sort_rank
          ) {
            return;
          }

          next[blockId] = structure;
          hasChanges = true;
          return;
        }

        if (!(blockId in next)) {
          return;
        }

        delete next[blockId];
        hasChanges = true;
      });

      return hasChanges ? next : current;
    });
  };

  const removeBlockContentDraft = (blockId: string) => {
    setBlockContentDrafts((currentDrafts) => {
      if (!(blockId in currentDrafts)) {
        return currentDrafts;
      }

      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[blockId];
      return nextDrafts;
    });
  };

  const handleCreateRootBlock = async () => {
    if (!selectedPageId || isCreatingBlock) return;

    const blockId = uuidv4();
    setIsCreatingBlock(true);

    try {
      const content = createBlockDocument();
      const sortRank = getSortRankAtParentEnd(null);

      flushSync(() => {
        createOptimisticBlock(blockId, null, sortRank, content, selectedPageId);
        setFocusTarget({ blockId, placement: "end" });
      });

      await queueNoteBlockCreate({
        id: blockId,
        pageId: selectedPageId,
        sortRank,
        type: "text",
        content,
      });
    } catch (error) {
      removeOptimisticCreatedBlock(blockId);
      throw error;
    } finally {
      setIsCreatingBlock(false);
    }
  };

  const handleCreateSiblingBlock = async (
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: JsonValue,
    nextSiblingContent?: JsonValue,
    options?: {
      focusPlacement?: "start" | "end";
      focusTarget?: "created" | "current";
      insertionSide?: "before" | "after";
    }
  ) => {
    if (!selectedPageId || isCreatingBlock) return;

    const focusPlacement = options?.focusPlacement ?? "end";
    const focusTarget = options?.focusTarget ?? "created";
    const insertionSide = options?.insertionSide ?? "after";
    let nextBlockId: string | null = null;

    setIsCreatingBlock(true);

    try {
      const serializedContent = JSON.stringify(nextContent);

      flushSync(() => {
        setBlockContentDrafts((currentDrafts) => ({
          ...currentDrafts,
          [blockId]: serializedContent,
        }));
      });

      updateNoteBlock({
        blockId,
        pageId: selectedPageId ?? undefined,
        content: nextContent,
      });

      await flushUpdate(blockId, "blocks");

      const nextParentBlockId = parentBlockId ?? null;
      const nextSortRank = insertionSide === "before"
        ? getRankBeforeItem(structuredBlocks, blockId, parentBlockId, (block) => block.parent_block_id)
        : getSortRankAfterBlock(blockId, parentBlockId);
      nextBlockId = uuidv4();
      const createdBlockId = nextBlockId;
      const createdContent = nextSiblingContent ?? createBlockDocument();

      flushSync(() => {
        createOptimisticBlock(createdBlockId, nextParentBlockId, nextSortRank, createdContent, selectedPageId);
        setFocusTarget({
          blockId: focusTarget === "current" ? blockId : createdBlockId,
          placement: focusPlacement,
        });
      });

      await queueNoteBlockCreate({
        id: createdBlockId,
        pageId: selectedPageId,
        parentBlockId: nextParentBlockId,
        sortRank: nextSortRank,
        type: "text",
        content: createdContent,
      });
    } catch (error) {
      if (nextBlockId) {
        removeOptimisticCreatedBlock(nextBlockId);
      }
      throw error;
    } finally {
      setIsCreatingBlock(false);
    }
  };

  const handleCreateEmptySiblingBlock = async (blockId: string, parentBlockId: string | null | undefined) => {
    if (!selectedPageId || isCreatingBlock) return;

    const nextBlockId = uuidv4();
    setIsCreatingBlock(true);

    try {
      const nextParentBlockId = parentBlockId ?? null;
      const nextSortRank = getSortRankAfterBlock(blockId, parentBlockId);
      const content = createBlockDocument();

      flushSync(() => {
        createOptimisticBlock(nextBlockId, nextParentBlockId, nextSortRank, content, selectedPageId);
        setFocusTarget({ blockId: nextBlockId, placement: "end" });
      });

      await queueNoteBlockCreate({
        id: nextBlockId,
        pageId: selectedPageId,
        parentBlockId: nextParentBlockId,
        sortRank: nextSortRank,
        type: "text",
        content,
      });
    } catch (error) {
      removeOptimisticCreatedBlock(nextBlockId);
      throw error;
    } finally {
      setIsCreatingBlock(false);
    }
  };

  const handleCreateSiblingBlocks = async (
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: NoteBlockInsert,
    nextSiblingContents: NoteBlockInsert[]
  ) => {
    if (!selectedPageId) return;

    const insertedBlocks: Array<Pick<NoteBlockRow, "id" | "parent_block_id" | "sort_rank">> = [];
    const optimisticBlocksToCreate: Array<{
      blockId: string;
      parentBlockId: string | null;
      sortRank: string;
      content: JsonValue;
      pageId: string;
    }> = [];
    const blockInputsToCreate: Array<{
      id: string;
      pageId: string;
      parentBlockId: string | null;
      sortRank: string;
      type: string;
      content: JsonValue;
    }> = [];

    const getWorkingBlocks = () => {
      const nextBlocks = new Map<string, Pick<NoteBlockRow, "id" | "parent_block_id" | "sort_rank">>();

      structuredBlocks.forEach((block) => {
        nextBlocks.set(block.id, block);
      });

      insertedBlocks.forEach((block) => {
        nextBlocks.set(block.id, block);
      });

      return [...nextBlocks.values()];
    };

    const getInsertionSortRank = (nextParentBlockId: string | null, previousSiblingId?: string | null) => {
      const workingBlocks = getWorkingBlocks();

      if (previousSiblingId) {
        return getRankAfterItem(workingBlocks, previousSiblingId, nextParentBlockId, (block) => block.parent_block_id);
      }

      return getRankAtParentEnd(workingBlocks, nextParentBlockId, (block) => block.parent_block_id);
    };

    const createInsertedBlocks = async (
      blocksToCreate: NoteBlockInsert[],
      nextParentBlockId: string | null,
      previousSiblingId?: string | null
    ): Promise<string | null> => {
      let currentPreviousSiblingId = previousSiblingId ?? null;
      let lastCreatedBlockId: string | null = null;

      for (const blockToCreate of blocksToCreate) {
        const createdBlockId = uuidv4();
        const nextSortRank = getInsertionSortRank(nextParentBlockId, currentPreviousSiblingId);

        insertedBlocks.push({
          id: createdBlockId,
          parent_block_id: nextParentBlockId,
          sort_rank: nextSortRank,
        });

        optimisticBlocksToCreate.push({
          blockId: createdBlockId,
          parentBlockId: nextParentBlockId,
          sortRank: nextSortRank,
          content: blockToCreate.content,
          pageId: selectedPageId,
        });

        blockInputsToCreate.push({
          id: createdBlockId,
          pageId: selectedPageId,
          parentBlockId: nextParentBlockId,
          sortRank: nextSortRank,
          type: "text",
          content: blockToCreate.content,
        });

        currentPreviousSiblingId = createdBlockId;
        lastCreatedBlockId = createdBlockId;

        if (blockToCreate.children && blockToCreate.children.length > 0) {
          lastCreatedBlockId = await createInsertedBlocks(blockToCreate.children, createdBlockId) ?? createdBlockId;
        }
      }

      return lastCreatedBlockId;
    };

    setIsCreatingBlock(true);

    try {
      const serializedContent = JSON.stringify(nextContent.content);

      flushSync(() => {
        setBlockContentDrafts((currentDrafts) => ({
          ...currentDrafts,
          [blockId]: serializedContent,
        }));
      });

      updateNoteBlock({
        blockId,
        pageId: selectedPageId ?? undefined,
        content: nextContent.content,
      });

      await flushUpdate(blockId, "blocks");

      let lastCreatedBlockId: string | null = null;

      if (nextContent.children && nextContent.children.length > 0) {
        lastCreatedBlockId = await createInsertedBlocks(nextContent.children, blockId) ?? lastCreatedBlockId;
      }

      if (nextSiblingContents.length > 0) {
        lastCreatedBlockId = await createInsertedBlocks(nextSiblingContents, parentBlockId ?? null, blockId) ?? lastCreatedBlockId;
      }

      flushSync(() => {
        createOptimisticBlocks(optimisticBlocksToCreate);
        if (lastCreatedBlockId) {
          setFocusTarget({ blockId: lastCreatedBlockId, placement: "end" });
        }
      });

      await queueNoteBlockCreates(blockInputsToCreate);
    } catch (error) {
      removeOptimisticCreatedBlocks(optimisticBlocksToCreate.map((block) => block.blockId));
      throw error;
    } finally {
      setIsCreatingBlock(false);
    }
  };

  const handleIndentBlock = (blockId: string, nextParentBlockId: string) => {
    const nextPosition = getIndentPosition(structuredBlocks, blockId, nextParentBlockId);

    flushSync(() => {
      setFocusTarget({ blockId, placement: "start" });
      applyOptimisticBlockMove(blockId, nextPosition.parentBlockId, nextPosition.sortRank);
    });

    void moveNoteBlock({
      blockId,
      pageId: selectedPageIdForWrite,
      parentBlockId: nextPosition.parentBlockId,
      sortRank: nextPosition.sortRank,
    });
  };

  const handleOutdentBlock = (blockId: string, nextParentBlockId?: string | null) => {
    const nextPosition = getOutdentPosition(structuredBlocks, blockId, nextParentBlockId);

    flushSync(() => {
      setFocusTarget({ blockId, placement: "start" });
      applyOptimisticBlockMove(blockId, nextPosition.parentBlockId, nextPosition.sortRank);
    });

    void moveNoteBlock({
      blockId,
      pageId: selectedPageIdForWrite,
      parentBlockId: nextPosition.parentBlockId,
      sortRank: nextPosition.sortRank,
    });
  };

  const handleMoveSelectedBlockRange = (
    blockIds: string[],
    direction: BlockRangeMoveDirection,
    focusBlockId: string,
  ) => {
    const moves = getBlockRangeMovePlan(structuredBlocks, blockIds, direction);

    if (moves.length === 0) {
      return;
    }

    flushSync(() => {
      setFocusTarget({ blockId: focusBlockId, placement: "start" });
      moves.forEach((move) => {
        applyOptimisticBlockMove(move.blockId, move.parentBlockId, move.sortRank);
      });
    });

    moves.forEach((move) => {
      moveNoteBlock({
        blockId: move.blockId,
        pageId: selectedPageIdForWrite,
        parentBlockId: move.parentBlockId,
        sortRank: move.sortRank,
      });
    });
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!selectedPageId) return;

    const isOptimisticCreatedBlock = Boolean(optimisticCreatedBlocks[blockId]) && !persistedSelectedBlockIds.has(blockId);
    if (isCreatingBlock && !isOptimisticCreatedBlock) return;

    const nextFocusTarget = getDeleteFocusTarget(orderedVisibleBlockIds, blockId);
    const childMoves = getDeleteChildMoves(structuredBlocks, blockId);
    const previousChildMoveStructures = childMoves.map((move) => ({
      blockId: move.blockId,
      structure: optimisticBlockStructure[move.blockId],
    }));

    setIsCreatingBlock(true);

    flushSync(() => {
      hideOptimisticBlock(blockId);
      childMoves.forEach((move) => {
        applyOptimisticBlockMove(move.blockId, move.parentBlockId, move.sortRank);
      });
      setFocusTarget(nextFocusTarget);
    });

    try {
      childMoves.forEach((move) => {
        moveNoteBlock({
          blockId: move.blockId,
          pageId: selectedPageIdForWrite,
          parentBlockId: move.parentBlockId,
          sortRank: move.sortRank,
        });
      });

      await Promise.all([
        flushUpdate(blockId, "blocks"),
        ...childMoves.map((move) => flushUpdate(move.blockId, "blocks")),
      ]);
      await deleteNoteBlock(blockId, selectedPageId);

      flushSync(() => {
        removeBlockContentDraft(blockId);

        if (isOptimisticCreatedBlock) {
          removeOptimisticCreatedBlock(blockId);
          restoreOptimisticBlock(blockId);
        }
      });
    } catch (error) {
      flushSync(() => {
        restoreOptimisticBlock(blockId);
        restoreOptimisticBlockMoves(previousChildMoveStructures);
        setFocusTarget(currentFocusTarget);
      });
      throw error;
    } finally {
      setIsCreatingBlock(false);
    }
  };

  const handleDeleteBlockRange = async (blockIds: string[]) => {
    for (let index = blockIds.length - 1; index >= 0; index -= 1) {
      const blockId = blockIds[index];
      await handleDeleteBlock(blockId);
    }
  };

  const handleMergeWithPreviousBlock = async (
    blockId: string,
    previousBlockId: string,
    nextContent: JsonValue,
    options?: { hasChildren?: boolean }
  ) => {
    const previousBlock = selectedBlockMap.get(previousBlockId);
    if (!selectedPageId || !previousBlock || isCreatingBlock) return;

    setIsCreatingBlock(true);

    try {
      const mergedContent = mergeNoteDocuments(previousBlock.content, nextContent) as JsonValue;
      const serializedMergedContent = JSON.stringify(mergedContent);
      const joinPlacement = getNoteDocumentEndSelection(previousBlock.content);
      const mergePlan = getMergePlan(blockId, previousBlockId, joinPlacement);
      const childMoves = options?.hasChildren
        ? getMergeChildMoves(structuredBlocks, blockId, mergePlan.updatedBlockId)
        : [];

      flushSync(() => {
        hideOptimisticBlock(mergePlan.deletedBlockId);
        setBlockContentDrafts((currentDrafts) => ({
          ...currentDrafts,
          [previousBlockId]: serializedMergedContent,
          [blockId]: JSON.stringify(normalizeNoteDocument(nextContent)),
        }));
        childMoves.forEach((move) => {
          applyOptimisticBlockMove(move.blockId, move.parentBlockId, move.sortRank);
        });
        setFocusTarget(mergePlan.focusTarget);
      });

      updateNoteBlock({
        blockId: mergePlan.updatedBlockId,
        pageId: selectedPageId ?? undefined,
        content: mergedContent,
      });
      childMoves.forEach((move) => {
        moveNoteBlock({
          blockId: move.blockId,
          pageId: selectedPageId ?? undefined,
          parentBlockId: move.parentBlockId,
          sortRank: move.sortRank,
        });
      });

      await flushUpdate(mergePlan.updatedBlockId, "blocks");
      await Promise.all(childMoves.map((move) => flushUpdate(move.blockId, "blocks")));
      try {
        await deleteNoteBlock(mergePlan.deletedBlockId, selectedPageId ?? undefined);
      } catch (error) {
        restoreOptimisticBlock(mergePlan.deletedBlockId);
        throw error;
      }
    } finally {
      setIsCreatingBlock(false);
    }
  };

  const handleUpdateBlockContent = (blockId: string, nextContent: JsonValue) => {
    const serializedContent = JSON.stringify(nextContent);
    const currentSerialized = blockContentDrafts[blockId] ?? selectedBlockMap.get(blockId)?.content ?? null;

    if (currentSerialized === serializedContent) {
      return;
    }

    setBlockContentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [blockId]: serializedContent,
    }));

    const blockType = selectedBlockMap.get(blockId)?.type;
    updateNoteBlock({
      blockId,
      pageId: selectedPageIdForWrite,
      content: nextContent,
      rawContent: blockType != null && blockType !== "text",
    });
  };

  const handleCommitBlockContent = (blockId: string, nextContent: JsonValue) => {
    const serializedContent = JSON.stringify(nextContent);
    const currentSerialized = blockContentDrafts[blockId] ?? selectedBlockMap.get(blockId)?.content ?? null;

    if (currentSerialized === serializedContent) {
      return;
    }

    setBlockContentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [blockId]: serializedContent,
    }));

    const blockType = selectedBlockMap.get(blockId)?.type;
    updateNoteBlock({
      blockId,
      pageId: selectedPageIdForWrite,
      content: nextContent,
      rawContent: blockType != null && blockType !== "text",
    });

    void flushUpdate(blockId, "blocks");
  };

  const handleConvertBlockType = (blockId: string, blockType: string, content: unknown) => {
    const serializedContent = JSON.stringify(content);

    setBlockContentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [blockId]: serializedContent,
    }));

    updateNoteBlock({
      blockId,
      pageId: selectedPageIdForWrite,
      type: blockType,
      content: content as JsonValue,
      rawContent: true,
    });

    void flushUpdate(blockId, "blocks");
  };

  return {
    handleCommitBlockContent,
    handleConvertBlockType,
    handleCreateEmptySiblingBlock,
    handleCreateRootBlock,
    handleCreateSiblingBlock,
    handleCreateSiblingBlocks,
    handleDeleteBlock,
    handleDeleteBlockRange,
    handleIndentBlock,
    handleMergeWithPreviousBlock,
    handleMoveSelectedBlockRange,
    handleOutdentBlock,
    handleUpdateBlockContent,
    orderedVisibleBlockIds,
    selectedBlockMap,
    structuredBlocks,
  };
}