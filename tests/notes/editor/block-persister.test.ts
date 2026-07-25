/// <reference types="vitest/globals" />

import { LexoRank } from "lexorank";

import { BlockDocumentPersister } from "@/lib/notes/editor/block-persister";
import { assembleDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

const RANK_0 = LexoRank.middle().format();
const RANK_1 = LexoRank.middle().genNext().format();

const executed: { sql: string; params: unknown[] }[] = [];
let failNextTransaction = false;

vi.mock("@/lib/powersync/db", () => {
  const execute = vi.fn((sql: string, params: unknown[] = []) => {
    executed.push({ sql, params });
    return Promise.resolve(undefined);
  });
  return {
    db: {
      execute,
      writeTransaction: vi.fn(async (fn: (tx: { execute: typeof execute }) => Promise<void>) => {
        if (failNextTransaction) {
          failNextTransaction = false;
          throw new Error("write failed");
        }
        await fn({ execute });
      }),
    },
  };
});

vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId: vi.fn(async () => "user-1") }));

const reconcileEdges = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock("@/lib/notes/notes", () => ({ reconcileNoteBlockEdges: (...args: unknown[]) => reconcileEdges(...args) }));

function docContent(text: string): string {
  return serializeNoteDocument({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}

function row(id: string, over: Partial<BlockDocumentRow> = {}): BlockDocumentRow {
  return { id, parent_block_id: null, sort_rank: RANK_0, type: "text", content: docContent(id), ...over };
}

function makePersister(initialRows: BlockDocumentRow[]) {
  let currentRows = initialRows;
  const onPersisted = vi.fn();
  const persister = new BlockDocumentPersister("page-1", {
    getDoc: () => assembleDoc(currentRows),
    debounceMs: 5,
    onPersisted,
  });
  persister.hydrate(initialRows);
  return { persister, onPersisted, setRows: (rows: BlockDocumentRow[]) => { currentRows = rows; } };
}

const sqlOf = (kind: "INSERT" | "UPDATE" | "DELETE FROM blocks" | "DELETE FROM edges") =>
  executed.filter((e) => e.sql.includes(kind));

beforeEach(() => {
  executed.length = 0;
  failNextTransaction = false;
  reconcileEdges.mockClear();
});

describe("BlockDocumentPersister save path", () => {
  it("writes nothing when the document is unchanged", async () => {
    const { persister, onPersisted } = makePersister([row("b1"), row("b2", { sort_rank: RANK_1 })]);
    await persister.flush();
    expect(executed).toEqual([]);
    expect(onPersisted).not.toHaveBeenCalled();
  });

  it("emits one UPDATE + edge reconcile for a content edit", async () => {
    const { persister, onPersisted, setRows } = makePersister([row("b1"), row("b2", { sort_rank: RANK_1 })]);
    setRows([row("b1", { content: docContent("edited") }), row("b2", { sort_rank: RANK_1 })]);
    await persister.flush();

    expect(sqlOf("UPDATE").length).toBe(1);
    expect(sqlOf("UPDATE")[0].params[4]).toBe("b1"); // WHERE id = ?
    expect(reconcileEdges).toHaveBeenCalledTimes(1);
    expect(onPersisted).toHaveBeenCalledTimes(1);
  });

  it("INSERTs a new block and reconciles its edges", async () => {
    const { persister, setRows } = makePersister([row("b1")]);
    setRows([row("b1"), row("b2", { sort_rank: RANK_1 })]);
    await persister.flush();
    expect(sqlOf("INSERT").length).toBe(1);
    expect(sqlOf("INSERT")[0].params[0]).toBe("b2");
    expect(reconcileEdges).toHaveBeenCalledTimes(1);
  });

  it("INSERTs (not UPDATEs) the stamped starter block's first content on a lazy page", async () => {
    // A fresh lazy page (journal) has no rows, but the id-plugin stamps the
    // empty starter block with an id on mount. hydrateFromDoc must NOT baseline
    // that unpersisted id, or the first content diffs to an UPDATE that matches
    // zero rows and is lost.
    let doc: ReturnType<typeof assembleDoc> = {
      type: "doc",
      content: [{ type: "block", attrs: { blockId: "X", blockType: "text" }, content: [{ type: "paragraph" }] }],
    };
    const ensurePage = vi.fn(async () => {});
    const persister = new BlockDocumentPersister("page-1", { getDoc: () => doc, debounceMs: 5, ensurePage });
    persister.hydrateFromDoc(doc, []);

    doc = {
      type: "doc",
      content: [
        {
          type: "block",
          attrs: { blockId: "X", blockType: "text" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
        },
      ],
    };
    await persister.flush();

    expect(ensurePage).toHaveBeenCalledTimes(1);
    expect(sqlOf("UPDATE").length).toBe(0);
    expect(sqlOf("INSERT").length).toBe(1);
    expect(sqlOf("INSERT")[0].params[0]).toBe("X");
  });

  it("writes nothing when flushed before it has hydrated (guards INSERT-all)", async () => {
    // A persister recreated (e.g. dev Fast Refresh) but never hydrated has an
    // empty snapshot; without the guard it would INSERT every doc block and
    // collide with the existing rows.
    const doc: ReturnType<typeof assembleDoc> = {
      type: "doc",
      content: [
        {
          type: "block",
          attrs: { blockId: "b1", blockType: "text" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
        },
      ],
    };
    const persister = new BlockDocumentPersister("page-1", { getDoc: () => doc, debounceMs: 5 });
    await persister.flush(); // no hydrate()
    expect(executed).toEqual([]);
  });

  it("does not re-INSERT a doc block that is already a persisted row", async () => {
    // Regression: buildSnapshotFromDoc must baseline every id present in the
    // rows it's given. A loaded block missing from the baseline diffs to an
    // INSERT and collides (UNIQUE constraint failed: blocks.id).
    const doc: ReturnType<typeof assembleDoc> = {
      type: "doc",
      content: [
        {
          type: "block",
          attrs: { blockId: "b1", blockType: "text" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
        },
      ],
    };
    const persister = new BlockDocumentPersister("page-1", { getDoc: () => doc, debounceMs: 5 });
    persister.hydrateFromDoc(doc, [row("b1")]);
    await persister.flush();
    expect(executed).toEqual([]);
  });

  it("DELETEs a removed block and its edges", async () => {
    const { persister, setRows } = makePersister([row("b1"), row("b2", { sort_rank: RANK_1 })]);
    setRows([row("b1")]);
    await persister.flush();
    expect(sqlOf("DELETE FROM blocks").length).toBe(1);
    expect(sqlOf("DELETE FROM edges").length).toBe(1);
    expect(sqlOf("DELETE FROM blocks")[0].params[0]).toBe("b2");
  });

  it("writes nothing for an edit that is reverted before flush (net-zero)", async () => {
    const { persister, setRows } = makePersister([row("b1")]);
    setRows([row("b1", { content: docContent("temp") })]);
    setRows([row("b1")]); // reverted
    await persister.flush();
    expect(executed).toEqual([]);
  });

  it("retains the snapshot on transaction failure so the next flush retries", async () => {
    const { persister, onPersisted, setRows } = makePersister([row("b1")]);
    setRows([row("b1", { content: docContent("edited") })]);

    failNextTransaction = true;
    await persister.flush().catch(() => {});
    expect(onPersisted).not.toHaveBeenCalled();

    // Retry succeeds and writes the same edit.
    executed.length = 0;
    await persister.flush();
    expect(sqlOf("UPDATE").length).toBe(1);
    expect(onPersisted).toHaveBeenCalledTimes(1);
  });
});
