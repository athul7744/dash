/**
 * Diff a decomposed document against the last-known persisted block rows and
 * produce the minimal set of INSERT/UPDATE/DELETE writes.
 *
 * Ordering: the editor document order is the source of truth. Each block needs a
 * `sort_rank` such that sorting siblings by rank reproduces document order. To
 * avoid sync churn we KEEP an existing block's rank whenever it still sorts
 * correctly among its siblings, and only mint fresh ranks for new or moved
 * blocks (fractional indexing — mirrors how the old store assigned ranks at
 * mutation time).
 *
 * Net-zero: a block whose normalized content, type, parent, and rank all match
 * the previous row produces no write (edit + undo within the debounce window
 * writes nothing), matching the old `flushDirtyEntities` behavior.
 *
 * Pure module — no DB. The persister feeds it `decomposeDoc(editor.getJSON())`
 * plus its snapshot of the last-persisted rows.
 */

import { LexoRank } from "lexorank";

import { parseRank } from "@/lib/shared/ranked-order";
import type { DecomposedBlock } from "./block-document";

export interface PersistedBlock {
  blockId: string;
  parentId: string | null;
  type: string;
  /** Normalized, serialized content (as produced by decomposeDoc). */
  content: string;
  sortRank: string;
}

export type BlockWrite =
  | { op: "insert"; row: PersistedBlock }
  | { op: "update"; row: PersistedBlock }
  | { op: "delete"; blockId: string };

export interface BlockDiffResult {
  writes: BlockWrite[];
  /** The full new row set (assigned ranks), to become the next snapshot. */
  next: Map<string, PersistedBlock>;
}

/** Produce `count` ranks strictly between `before` and `after` (either may be null), ascending. */
function spreadRanks(before: LexoRank | null, after: LexoRank | null, count: number): LexoRank[] {
  const result: LexoRank[] = [];
  if (before && after) {
    let cursor = before;
    for (let i = 0; i < count; i++) {
      cursor = cursor.between(after);
      result.push(cursor);
    }
  } else if (before && !after) {
    let cursor = before;
    for (let i = 0; i < count; i++) {
      cursor = cursor.genNext();
      result.push(cursor);
    }
  } else if (!before && after) {
    // Build descending below `after`, then reverse to ascending.
    let cursor = after;
    for (let i = 0; i < count; i++) {
      cursor = cursor.genPrev();
      result.push(cursor);
    }
    result.reverse();
  } else {
    let cursor = LexoRank.middle();
    for (let i = 0; i < count; i++) {
      cursor = i === 0 ? cursor : cursor.genNext();
      result.push(cursor);
    }
  }
  return result;
}

/**
 * Assign ranks to one sibling group (in document order), reusing prior ranks
 * where they still sort monotonically and gap-filling the rest.
 */
function assignGroupRanks(
  group: { blockId: string; prevRank: LexoRank | null }[],
): Map<string, string> {
  // Pass 1: greedily keep prior ranks that stay strictly increasing in doc order.
  const kept: (LexoRank | null)[] = [];
  let lastKept: LexoRank | null = null;
  for (const { prevRank } of group) {
    if (prevRank && (lastKept === null || prevRank.compareTo(lastKept) > 0)) {
      kept.push(prevRank);
      lastKept = prevRank;
    } else {
      kept.push(null);
    }
  }

  // Pass 2: fill floating runs between kept anchors.
  const finalRanks = new Array<LexoRank>(group.length);
  let prevAnchor: LexoRank | null = null;
  let i = 0;
  while (i < group.length) {
    if (kept[i]) {
      finalRanks[i] = kept[i]!;
      prevAnchor = kept[i];
      i += 1;
      continue;
    }
    let j = i;
    while (j < group.length && !kept[j]) j += 1;
    const nextAnchor = j < group.length ? kept[j] : null;
    const filled = spreadRanks(prevAnchor, nextAnchor, j - i);
    for (let k = 0; k < filled.length; k++) finalRanks[i + k] = filled[k];
    prevAnchor = filled.length ? filled[filled.length - 1] : prevAnchor;
    i = j;
  }

  const out = new Map<string, string>();
  group.forEach((entry, index) => out.set(entry.blockId, finalRanks[index].format()));
  return out;
}

export function diffBlocks(
  decomposed: DecomposedBlock[],
  prev: Map<string, PersistedBlock>,
): BlockDiffResult {
  // Group by parent, preserving document (order) within each group.
  const groups = new Map<string | null, { blockId: string; prevRank: LexoRank | null }[]>();
  for (const block of decomposed) {
    const bucket = groups.get(block.parentId) ?? [];
    const priorSameParent = prev.get(block.blockId);
    // Only reuse a prior rank when the block stayed under the same parent.
    const prevRank =
      priorSameParent && priorSameParent.parentId === block.parentId
        ? parseRank(priorSameParent.sortRank)
        : null;
    bucket.push({ blockId: block.blockId, prevRank });
    groups.set(block.parentId, bucket);
  }

  const rankById = new Map<string, string>();
  for (const [, group] of groups) {
    for (const [id, rank] of assignGroupRanks(group)) rankById.set(id, rank);
  }

  const next = new Map<string, PersistedBlock>();
  const writes: BlockWrite[] = [];

  for (const block of decomposed) {
    const row: PersistedBlock = {
      blockId: block.blockId,
      parentId: block.parentId,
      type: block.type,
      content: block.content,
      sortRank: rankById.get(block.blockId)!,
    };
    next.set(block.blockId, row);

    const before = prev.get(block.blockId);
    if (!before) {
      writes.push({ op: "insert", row });
    } else if (
      before.content !== row.content ||
      before.type !== row.type ||
      before.parentId !== row.parentId ||
      before.sortRank !== row.sortRank
    ) {
      writes.push({ op: "update", row });
    }
    // else: net-zero, no write.
  }

  for (const blockId of prev.keys()) {
    if (!next.has(blockId)) writes.push({ op: "delete", blockId });
  }

  return { writes, next };
}
