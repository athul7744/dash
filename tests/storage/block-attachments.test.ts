/// <reference types="vitest/globals" />

/**
 * Keeping a block down to the one file it actually shows.
 *
 * A block holds one content node, so it has one image at a time; anything
 * earlier is a version nothing can reach. Nothing else reclaims those — the
 * orphan sweep looks for Storage objects with *no* live row and these rows are
 * live, and the details rail refuses to delete a block-owned file because doing
 * so would strand the block pointing at it. So the block has to tidy itself,
 * and the one thing it must never do is delete the file it is about to show.
 */

import { keepOnlyBlockAttachment } from "@/lib/storage/attachments";

vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), getAll: vi.fn(async () => []) } }));
// `purgeFiles` reclaims the bytes fire-and-forget; these stand in for the local
// cache and the bucket so the tidy's own decisions are what's under test.
vi.mock("@/lib/storage/local-blob-store", () => ({
  put: vi.fn(),
  remove: vi.fn(async () => {}),
  get: vi.fn(),
}));
vi.mock("@/lib/storage/blob-preview", () => ({ dropBlobPreview: vi.fn(), primeBlobPreview: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ remove: vi.fn() }) } }) }));

/** Records what the tidy reads and deletes. */
function fakeCtx(rows: { id: string; file_path: string }[]) {
  const deletes: { sql: string; params: unknown[] }[] = [];
  return {
    deletes,
    getAll: async <T,>(_sql: string, params: unknown[] = []) => {
      const [blockId, keepId] = params as string[];
      return rows.filter((r) => r.id !== keepId && blockId) as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("DELETE")) deletes.push({ sql, params });
      return undefined;
    },
  };
}

describe("keepOnlyBlockAttachment", () => {
  it("removes the versions the block no longer shows", async () => {
    const ctx = fakeCtx([
      { id: "old-1", file_path: "u/b/old-1.webp" },
      { id: "old-2", file_path: "u/b/old-2.webp" },
      { id: "current", file_path: "u/b/current.webp" },
    ]);
    await keepOnlyBlockAttachment("block-1", "current", ctx);

    expect(ctx.deletes).toHaveLength(1);
    // Scoped to the block, and excluding the one being kept — both halves
    // matter: without the first it would clear the page, without the second it
    // would delete the image it is there to keep.
    expect(ctx.deletes[0].params).toEqual(["block-1", "current"]);
  });

  it("does nothing when the block already owns only that file", async () => {
    const ctx = fakeCtx([{ id: "current", file_path: "u/b/current.webp" }]);
    await keepOnlyBlockAttachment("block-1", "current", ctx);
    expect(ctx.deletes).toEqual([]);
  });

  it("refuses to run without an id to keep", async () => {
    // Otherwise this is "delete everything the block owns" wearing the wrong
    // name — including the file the caller just stored.
    const ctx = fakeCtx([{ id: "current", file_path: "u/b/current.webp" }]);
    await keepOnlyBlockAttachment("block-1", "", ctx);
    expect(ctx.deletes).toEqual([]);
  });

  it("refuses to run without a block", async () => {
    const ctx = fakeCtx([{ id: "current", file_path: "u/b/current.webp" }]);
    await keepOnlyBlockAttachment("", "current", ctx);
    expect(ctx.deletes).toEqual([]);
  });
});
