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
