/// <reference types="vitest/globals" />

/**
 * Undoing an import after the dialog has closed.
 *
 * The undo has to outlive the dialog — you only know whether an import worked
 * after opening a few pages — so it's rebuilt from what's already stored on each
 * page rather than from component state.
 */

const { getAll, softDeleteEntity } = vi.hoisted(() => ({
  getAll: vi.fn(),
  softDeleteEntity: vi.fn(),
}));

vi.mock("@/lib/powersync/db", () => ({ db: { getAll, execute: vi.fn(), writeTransaction: vi.fn() } }));
vi.mock("@/lib/shared/trash", () => ({ softDeleteEntity }));

import {
  LAST_IMPORT_BATCH_QUERY,
  toImportBatchSummary,
  undoImportBatch,
  type LastImportBatchRow,
} from "@/lib/notes/import/undo-import";

beforeEach(() => {
  getAll.mockReset();
  softDeleteEntity.mockReset();
  softDeleteEntity.mockResolvedValue(undefined);
});

describe("LAST_IMPORT_BATCH_QUERY", () => {
  it("groups by batch and takes the newest", () => {
    expect(LAST_IMPORT_BATCH_QUERY).toContain("GROUP BY batch_id");
    expect(LAST_IMPORT_BATCH_QUERY).toContain("ORDER BY imported_at DESC");
  });

  it("ignores pages already in the Trash", () => {
    // An import that's been undone has nothing left to undo, so its batch must
    // drop out of the query entirely rather than showing a stale count.
    expect(LAST_IMPORT_BATCH_QUERY).toContain("deleted_at IS NULL");
  });
});

describe("toImportBatchSummary", () => {
  it("reads a row", () => {
    const row: LastImportBatchRow = { batch_id: "b-1", imported_at: "2026-09-08T10:00:00.000Z", page_count: 54 };
    expect(toImportBatchSummary(row)).toEqual({
      batchId: "b-1",
      importedAt: "2026-09-08T10:00:00.000Z",
      pageCount: 54,
    });
  });

  it("is null when there is no import to undo", () => {
    expect(toImportBatchSummary(undefined)).toBeNull();
    expect(toImportBatchSummary({ batch_id: null, imported_at: null, page_count: 0 })).toBeNull();
  });
});

describe("undoImportBatch", () => {
  it("soft-deletes every live page in the batch", async () => {
    // Soft, so blocks, tags, links and stored images survive and any single page
    // can be restored from the Trash.
    getAll.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);

    const moved = await undoImportBatch("b-1");

    expect(moved).toBe(3);
    expect(getAll).toHaveBeenCalledWith(expect.stringContaining("$.importedBatch"), ["b-1"]);
    expect(softDeleteEntity.mock.calls).toEqual([
      ["note", "p1"],
      ["note", "p2"],
      ["note", "p3"],
    ]);
  });

  it("does nothing for a batch with no live pages", async () => {
    getAll.mockResolvedValue([]);
    expect(await undoImportBatch("b-1")).toBe(0);
    expect(softDeleteEntity).not.toHaveBeenCalled();
  });

  it("only touches pages from the batch it was given", async () => {
    getAll.mockResolvedValue([{ id: "p1" }]);
    await undoImportBatch("b-2");
    const [, params] = getAll.mock.calls[0];
    expect(params).toEqual(["b-2"]);
  });
});
