"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import type { NoteBlockRow } from "@/hooks/use-notes";
import { serializeNoteDocument } from "@/lib/notes/notes-content";
import { getVisibleNoteBlockIds } from "@/lib/notes/notes-tree";
import { getRankAfterItem, getRankAtParentEnd } from "@/lib/shared/ranked-order";
import type { JsonValue } from "@/lib/notes/notes";

import type { OptimisticBlockStructure } from "./types";

export type UseOptimisticBlockStateParams = {
  selectedBlocks: NoteBlockRow[];
  blockContentDrafts: Record<string, string>;
  optimisticBlockStructure: Record<string, OptimisticBlockStructure>;
  setOptimisticBlockStructure: Dispatch<SetStateAction<Record<string, OptimisticBlockStructure>>>;
};

export function useOptimisticBlockState({
  selectedBlocks,
  blockContentDrafts,
  optimisticBlockStructure,
  setOptimisticBlockStructure,
}: UseOptimisticBlockStateParams) {
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

  return {
    structuredBlocks,
    selectedBlockMap,
    persistedSelectedBlockIds,
    orderedVisibleBlockIds,
    optimisticCreatedBlocks,
    getSortRankAtParentEnd,
    getSortRankAfterBlock,
    applyOptimisticBlockMove,
    createOptimisticBlock,
    createOptimisticBlocks,
    removeOptimisticCreatedBlock,
    removeOptimisticCreatedBlocks,
    hideOptimisticBlock,
    restoreOptimisticBlock,
    restoreOptimisticBlockMoves,
  };
}
