/// <reference types="vitest/globals" />

export {};

import { v5 as uuidv5 } from "uuid";

const EDGE_ID_NAMESPACE = "9b17a01f-3454-4db0-8f39-7f093ac0f56b";

type EdgeRow = { id: string; target_id: string; type: string };
type PageRow = { id: string; title: string | null };

const notesExecuteMock = vi.fn<(...args: any[]) => Promise<any>>(async () => undefined);
const notesGetAllMock = vi.fn<(...args: any[]) => Promise<any>>(async () => []);
const notesGetOptionalMock = vi.fn<(...args: any[]) => Promise<any>>(async () => null);
const notesGetCurrentUserIdMock = vi.fn(async () => "user-1");

vi.mock("@/lib/powersync/db", () => ({
  db: {
    execute: notesExecuteMock,
    getAll: notesGetAllMock,
    getOptional: notesGetOptionalMock,
  },
}));

vi.mock("@/lib/shared/auth", () => ({
  getCurrentUserId: notesGetCurrentUserIdMock,
}));

describe("reconcileNoteBlockEdges", () => {
  let pageRows: PageRow[];
  let edgeRows: EdgeRow[];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    pageRows = [{ id: "page-1", title: "Ref Page" }];
    edgeRows = [];

    notesGetCurrentUserIdMock.mockResolvedValue("user-1");

    notesGetAllMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT id, title FROM pages")) {
        return pageRows;
      }

      if (sql.includes("SELECT id, target_id, type FROM edges WHERE source_block_id = ?")) {
        const sourceBlockId = String(params?.[0] ?? "");
        if (sourceBlockId !== "block-1") return [];
        return edgeRows;
      }

      return [];
    });
  });

  it("does not write when desired page_ref edges are already present", async () => {
    edgeRows = [{ id: "existing-edge", target_id: "page-1", type: "page_ref" }];

    const { reconcileNoteBlockEdges } = await import("@/lib/notes/notes");
    await reconcileNoteBlockEdges("block-1", "[[Ref Page]]");

    expect(notesExecuteMock).not.toHaveBeenCalled();
  });

  it("inserts missing edge with deterministic id", async () => {
    const { reconcileNoteBlockEdges } = await import("@/lib/notes/notes");
    await reconcileNoteBlockEdges("block-1", "[[Ref Page]]");

    expect(notesExecuteMock).toHaveBeenCalledTimes(1);

    const [sql, params] = notesExecuteMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO edges");

    const expectedId = uuidv5("block-1|page-1|page_ref", EDGE_ID_NAMESPACE);
    expect(params).toEqual([expectedId, "block-1", "page-1", "user-1", "page_ref"]);
  });

  it("removes duplicate page refs and legacy tag edges without inserting tags", async () => {
    edgeRows = [
      { id: "edge-keep", target_id: "page-1", type: "page_ref" },
      { id: "edge-dup", target_id: "page-1", type: "page_ref" },
      { id: "edge-stale", target_id: "tag:old", type: "tag_ref" },
    ];

    const { reconcileNoteBlockEdges } = await import("@/lib/notes/notes");
    // `#new` is no longer a reference token — inline tags were removed.
    await reconcileNoteBlockEdges("block-1", "[[Ref Page]] #new");

    const calls = notesExecuteMock.mock.calls as Array<[string, unknown[]]>;

    // Only deletions: the duplicate page ref and the now-unsupported tag edge.
    expect(calls).toHaveLength(2);
    expect(calls.every(([sql]) => sql === "DELETE FROM edges WHERE id = ?")).toBe(true);
    const deletedIds = calls.map(([, params]) => (params as string[])[0]);
    expect(new Set(deletedIds)).toEqual(new Set(["edge-dup", "edge-stale"]));
  });
});
