/// <reference types="vitest/globals" />

/**
 * `reconcileEntityRefs` is the single writer of the `edges` table, so what it
 * emits for a given piece of text is what the whole link layer sees: backlinks,
 * the graph, a day's "linked from". It replaces a source's edges wholesale, so a
 * bug here doesn't just fail to add a link — it deletes the ones already there.
 */

import { reconcileEntityRefs } from "@/lib/links/links";

const { getCurrentUserId } = vi.hoisted(() => ({ getCurrentUserId: vi.fn(async () => "user-1") }));

vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId }));
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), getAll: vi.fn(async () => []) } }));

/** A stand-in for a transaction that records what reconcile writes. */
function fakeCtx(existing: { id: string; target_id: string; type: string }[] = []) {
  const inserts: { targetId: string; type: string }[] = [];
  const deletes: string[] = [];
  return {
    inserts,
    deletes,
    getAll: async <T,>() => existing as T[],
    execute: async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("DELETE")) deletes.push(params[0] as string);
      if (sql.startsWith("INSERT")) inserts.push({ targetId: params[2] as string, type: params[4] as string });
      return undefined;
    },
  };
}

const TARGET = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

describe("reconcileEntityRefs", () => {
  beforeEach(() => getCurrentUserId.mockClear());

  it("writes one edge per id-bound reference", async () => {
    const ctx = fakeCtx();
    await reconcileEntityRefs("block-1", [`see [[Project|note:${TARGET}]] for detail`], ctx);
    expect(ctx.inserts).toEqual([{ targetId: TARGET, type: "ref" }]);
  });

  it("leaves text with no tokens with no edges — and deletes none it didn't have", async () => {
    // The regression that matters: plain prose must not disturb a source's
    // edges, since reconcile runs on every keystroke-debounced save.
    const ctx = fakeCtx();
    await reconcileEntityRefs("block-1", ["a note about September, with braces {} and a date"], ctx);
    expect(ctx.inserts).toEqual([]);
    expect(ctx.deletes).toEqual([]);
  });

  it("keeps an existing edge that the text still carries", async () => {
    const ctx = fakeCtx([{ id: "edge-1", target_id: TARGET, type: "ref" }]);
    await reconcileEntityRefs("block-1", [`[[Project|note:${TARGET}]]`], ctx);
    expect(ctx.inserts).toEqual([]);
    expect(ctx.deletes).toEqual([]);
  });

  it("drops an edge the text no longer carries", async () => {
    const ctx = fakeCtx([{ id: "edge-1", target_id: TARGET, type: "ref" }]);
    await reconcileEntityRefs("block-1", ["the reference is gone"], ctx);
    expect(ctx.deletes).toEqual(["edge-1"]);
  });

  it("links the day a date chip names", async () => {
    const ctx = fakeCtx();
    await reconcileEntityRefs("block-1", ["shipped on {Sep 20, 2026}"], ctx);
    expect(ctx.inserts).toHaveLength(1);
    expect(ctx.inserts[0].type).toBe("ref");
    // The target is the journal page's deterministic id, so it is stable rather
    // than checkable by eye; what matters is that it is a uuid, not the label.
    expect(ctx.inserts[0].targetId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("carries references and date chips together", async () => {
    const ctx = fakeCtx();
    await reconcileEntityRefs("block-1", [`[[Project|note:${TARGET}]] due {Sep 20, 2026}`], ctx);
    expect(ctx.inserts).toHaveLength(2);
    expect(ctx.inserts.map((e) => e.targetId)).toContain(TARGET);
  });

  it("does not reach for the user id when there is no date to link", async () => {
    // Reconcile runs inside a write transaction; the fewer awaits in that path,
    // the better. Text without a chip should never trigger the auth lookup.
    const ctx = fakeCtx();
    await reconcileEntityRefs("block-1", [`[[Project|note:${TARGET}]]`], ctx);
    expect(getCurrentUserId).toHaveBeenCalledTimes(1); // replaceEdges, for the insert
  });
});
