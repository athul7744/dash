/// <reference types="vitest/globals" />

import { LexoRank } from "lexorank";

import { diffBlocks, type PersistedBlock } from "@/lib/notes/editor/block-diff";
import type { DecomposedBlock } from "@/lib/notes/editor/block-document";
import { parseRank } from "@/lib/shared/ranked-order";

function dec(blockId: string, parentId: string | null, order: number, content = `c-${blockId}`): DecomposedBlock {
  return { blockId, parentId, order, type: "text", content };
}

function prevRow(blockId: string, parentId: string | null, sortRank: string, content = `c-${blockId}`): PersistedBlock {
  return { blockId, parentId, type: "text", content, sortRank };
}

/** Assert the assigned ranks sort into the given block-id order within a parent group. */
function assertRankOrder(next: Map<string, PersistedBlock>, parentId: string | null, expectedOrder: string[]) {
  const group = [...next.values()].filter((b) => b.parentId === parentId);
  group.sort((a, b) => a.sortRank.localeCompare(b.sortRank));
  expect(group.map((b) => b.blockId)).toEqual(expectedOrder);
}

describe("diffBlocks", () => {
  it("inserts all blocks when there is no prior state", () => {
    const { writes, next } = diffBlocks([dec("b1", null, 0), dec("b2", null, 1)], new Map());
    expect(writes.every((w) => w.op === "insert")).toBe(true);
    assertRankOrder(next, null, ["b1", "b2"]);
  });

  it("produces no writes when nothing changed (net-zero)", () => {
    const prev = new Map([
      ["b1", prevRow("b1", null, LexoRank.middle().format())],
      ["b2", prevRow("b2", null, LexoRank.middle().genNext().format())],
    ]);
    const decomposed = [
      dec("b1", null, 0),
      dec("b2", null, 1),
    ];
    const { writes } = diffBlocks(decomposed, prev);
    expect(writes).toEqual([]);
  });

  it("emits a single update for a content change and keeps ranks stable", () => {
    const r1 = LexoRank.middle().format();
    const r2 = LexoRank.middle().genNext().format();
    const prev = new Map([
      ["b1", prevRow("b1", null, r1)],
      ["b2", prevRow("b2", null, r2)],
    ]);
    const { writes, next } = diffBlocks([dec("b1", null, 0), dec("b2", null, 1, "edited")], prev);
    expect(writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ op: "update", row: { blockId: "b2", content: "edited" } });
    // Unchanged block keeps its rank (no churn).
    expect(next.get("b1")?.sortRank).toBe(r1);
  });

  it("deletes rows that disappeared from the document", () => {
    const prev = new Map([
      ["b1", prevRow("b1", null, LexoRank.middle().format())],
      ["gone", prevRow("gone", null, LexoRank.middle().genNext().format())],
    ]);
    const { writes } = diffBlocks([dec("b1", null, 0)], prev);
    expect(writes).toContainEqual({ op: "delete", blockId: "gone" });
    expect(writes.filter((w) => w.op === "delete").length).toBe(1);
  });

  it("assigns a rank to a new block inserted between two existing ones without churning them", () => {
    const r1 = LexoRank.middle().format();
    const r3 = LexoRank.middle().genNext().genNext().format();
    const prev = new Map([
      ["b1", prevRow("b1", null, r1)],
      ["b3", prevRow("b3", null, r3)],
    ]);
    // New b2 inserted between b1 and b3.
    const decomposed = [dec("b1", null, 0), dec("b2", null, 1), dec("b3", null, 2)];
    const { writes, next } = diffBlocks(decomposed, prev);

    // Only b2 is written (insert); b1 and b3 keep their ranks.
    expect(writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ op: "insert", row: { blockId: "b2" } });
    expect(next.get("b1")?.sortRank).toBe(r1);
    expect(next.get("b3")?.sortRank).toBe(r3);
    // Ranks sort b1 < b2 < b3.
    assertRankOrder(next, null, ["b1", "b2", "b3"]);
    const b2Rank = parseRank(next.get("b2")!.sortRank)!;
    expect(b2Rank.compareTo(parseRank(r1)!)).toBeGreaterThan(0);
    expect(b2Rank.compareTo(parseRank(r3)!)).toBeLessThan(0);
  });

  it("re-ranks a moved block so ranks reproduce the new order", () => {
    const r1 = LexoRank.middle().format();
    const r2 = LexoRank.middle().genNext().format();
    const r3 = LexoRank.middle().genNext().genNext().format();
    const prev = new Map([
      ["b1", prevRow("b1", null, r1)],
      ["b2", prevRow("b2", null, r2)],
      ["b3", prevRow("b3", null, r3)],
    ]);
    // b3 moved to the front: order is now b3, b1, b2.
    const decomposed = [dec("b3", null, 0), dec("b1", null, 1), dec("b2", null, 2)];
    const { next } = diffBlocks(decomposed, prev);
    assertRankOrder(next, null, ["b3", "b1", "b2"]);
  });

  it("re-ranks and updates a block that changed parent (indent)", () => {
    const r1 = LexoRank.middle().format();
    const r2 = LexoRank.middle().genNext().format();
    const prev = new Map([
      ["b1", prevRow("b1", null, r1)],
      ["b2", prevRow("b2", null, r2)],
    ]);
    // b2 indented under b1.
    const decomposed = [dec("b1", null, 0), dec("b2", "b1", 0)];
    const { writes, next } = diffBlocks(decomposed, prev);
    expect(next.get("b2")?.parentId).toBe("b1");
    expect(writes).toContainEqual(expect.objectContaining({ op: "update", row: expect.objectContaining({ blockId: "b2", parentId: "b1" }) }));
    assertRankOrder(next, "b1", ["b2"]);
  });

  it("handles several new blocks appended in order", () => {
    const r1 = LexoRank.middle().format();
    const prev = new Map([["b1", prevRow("b1", null, r1)]]);
    const decomposed = [dec("b1", null, 0), dec("n1", null, 1), dec("n2", null, 2), dec("n3", null, 3)];
    const { next } = diffBlocks(decomposed, prev);
    assertRankOrder(next, null, ["b1", "n1", "n2", "n3"]);
    expect(next.get("b1")?.sortRank).toBe(r1);
  });
});
