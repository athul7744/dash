/// <reference types="vitest/globals" />

import { resolveBlockId } from "@/lib/notes/editor/block-id-plugin";

describe("resolveBlockId", () => {
  it("keeps a present, unseen id and records it", () => {
    const seen = new Set<string>();
    expect(resolveBlockId("b1", seen)).toBe("b1");
    expect(seen.has("b1")).toBe(true);
  });

  it("mints a new id when the block has none", () => {
    const seen = new Set<string>();
    let n = 0;
    const mint = () => `mint-${++n}`;
    expect(resolveBlockId(null, seen, mint)).toBe("mint-1");
    expect(resolveBlockId(undefined, seen, mint)).toBe("mint-2");
  });

  it("reassigns a duplicate id (copy/paste) while leaving the first occurrence", () => {
    const seen = new Set<string>();
    let n = 0;
    const mint = () => `mint-${++n}`;
    expect(resolveBlockId("dup", seen, mint)).toBe("dup"); // first wins
    expect(resolveBlockId("dup", seen, mint)).toBe("mint-1"); // second reassigned
  });

  it("skips minted ids that collide with already-seen ids", () => {
    const seen = new Set<string>(["mint-1"]);
    let n = 0;
    const mint = () => `mint-${++n}`;
    // mint-1 is taken → advances to mint-2.
    expect(resolveBlockId(null, seen, mint)).toBe("mint-2");
  });
});
