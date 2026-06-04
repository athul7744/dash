/// <reference types="vitest/globals" />

import { NoteBlockStore, type BlockNode, type BlockRow } from "@/lib/notes/note-block-store";

// Mock dependencies
vi.mock("@/lib/powersync/db", () => {
  // In-memory simulation of the `blocks` table so the read-compare flush logic
  // (which SELECTs current rows before writing) can be exercised realistically.
  const table = new Map<string, { id: string; content: string; type: string; parent_block_id: string | null; sort_rank: string }>();

  const runExecute = (sql: string, params: any[] = []) => {
    if (sql.includes("INSERT INTO blocks")) {
      const [id, , , parent_block_id, type, content, sort_rank] = params;
      table.set(id, { id, content, type, parent_block_id, sort_rank });
    } else if (sql.includes("UPDATE blocks SET content")) {
      const [content, type, parent_block_id, sort_rank, id] = params;
      table.set(id, { id, content, type, parent_block_id, sort_rank });
    } else if (sql.includes("DELETE FROM blocks")) {
      table.delete(params[0]);
    }
    return Promise.resolve(undefined);
  };

  const runGetAll = (sql: string, params: any[] = []) => {
    if (sql.includes("FROM blocks WHERE id IN")) {
      return Promise.resolve(params.map((id) => table.get(id)).filter(Boolean));
    }
    return Promise.resolve([]);
  };

  const execute = vi.fn(runExecute);
  const getAll = vi.fn(runGetAll);

  return {
    db: {
      execute,
      getAll,
      writeTransaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<void>) => {
        // Share the same spies so existing assertions on db.execute still see tx writes
        await fn({ execute, getAll });
      }),
      __seed: (rows: { id: string; content: string; type?: string; parent_block_id?: string | null; sort_rank?: string }[]) => {
        for (const r of rows) {
          table.set(r.id, {
            id: r.id,
            content: r.content,
            type: r.type ?? "text",
            parent_block_id: r.parent_block_id ?? null,
            sort_rank: r.sort_rank ?? "a0",
          });
        }
      },
      __clear: () => table.clear(),
    },
  };
});

vi.mock("@/lib/shared/auth", () => ({
  getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
}));

vi.mock("@/lib/notes/notes-content", () => ({
  serializeNoteDocument: (doc: unknown) => JSON.stringify(normalizeDoc(doc)),
  normalizeNoteDocument: (raw: unknown) => normalizeDoc(raw),
  extractNoteText: () => "",
}));

// Mirror the real normalizeNoteDocument: anything that isn't a Tiptap note
// document (an object with a string `type`) is wiped to an empty doc. This is
// what makes query-block config JSON get destroyed if it's normalized.
function normalizeDoc(raw: unknown): any {
  const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };
  if (!raw) return EMPTY;
  if (typeof raw === "string") {
    try { return normalizeDoc(JSON.parse(raw)); } catch { return EMPTY; }
  }
  if (typeof raw === "object" && raw !== null && typeof (raw as any).type === "string") {
    return raw;
  }
  return EMPTY;
}

vi.mock("@/lib/notes/notes", () => ({
  reconcileNoteBlockEdges: vi.fn().mockResolvedValue(undefined),
}));

const { db } = await import("@/lib/powersync/db");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlockRow(overrides: Partial<BlockRow> = {}): BlockRow {
  return {
    id: overrides.id ?? "block-1",
    page_id: overrides.page_id ?? "page-1",
    parent_block_id: overrides.parent_block_id ?? null,
    sort_rank: overrides.sort_rank ?? "a0",
    type: overrides.type ?? "text",
    content: overrides.content ?? JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
  };
}

function createMockEditor(content: object = { type: "doc", content: [] }) {
  return {
    getJSON: () => content,
    commands: {
      setContent: vi.fn().mockReturnValue(true),
    },
  } as any;
}

/** Editor mock whose getJSON() reflects the latest setContent() call (for round-trip tests). */
function createLiveMockEditor(initial: object = { type: "doc", content: [] }) {
  let current: object = initial;
  return {
    getJSON: () => current,
    commands: {
      setContent: vi.fn((next: object) => {
        current = next;
        return true;
      }),
    },
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("NoteBlockStore", () => {
  let store: NoteBlockStore;

  beforeEach(() => {
    vi.useFakeTimers();
    (db as any).__clear();
    vi.mocked(db.execute).mockClear();
    vi.mocked(db.getAll).mockClear();
    store = new NoteBlockStore("page-1", { debounceMs: 100 });
  });

  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
  });

  describe("hydrate", () => {
    it("populates nodes from block rows", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1", parent_block_id: "b1" }),
      ]);

      expect(store.blockCount).toBe(2);
      expect(store.getBlock("b1")).toBeDefined();
      expect(store.getBlock("b2")?.parentId).toBe("b1");
    });

    it("preserves existing editor refs across hydration", () => {
      store.hydrate([makeBlockRow({ id: "b1" })]);
      const mockEditor = createMockEditor();
      store.setEditorRef("b1", mockEditor);

      store.hydrate([makeBlockRow({ id: "b1" })]);
      expect(store.getEditorRef("b1")).toBe(mockEditor);
    });

    it("stores initial content for new blocks", () => {
      const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
      store.hydrate([makeBlockRow({ id: "b1", content: JSON.stringify(content) })]);

      expect(store.getInitialContent("b1")).toEqual(content);
    });

    it("consumeInitialContent removes the pending content", () => {
      store.hydrate([makeBlockRow({ id: "b1" })]);
      expect(store.getInitialContent("b1")).toBeDefined();

      store.consumeInitialContent("b1");
      expect(store.getInitialContent("b1")).toBeUndefined();
    });
  });

  describe("createBlock", () => {
    it("adds a new block to the store", () => {
      store.hydrate([]);
      const id = store.createBlock({ sortRank: "a0", content: { type: "doc", content: [] } });

      expect(store.has(id)).toBe(true);
      expect(store.blockCount).toBe(1);
    });

    it("pushes an undo command", () => {
      store.hydrate([]);
      store.createBlock({ sortRank: "a0" });

      expect(store.canUndo).toBe(true);
    });

    it("allows specifying a custom id", () => {
      store.hydrate([]);
      const id = store.createBlock({ id: "custom-id", sortRank: "a0" });

      expect(id).toBe("custom-id");
      expect(store.has("custom-id")).toBe(true);
    });

    it("persists creates in flushStructure", async () => {
      store.hydrate([]);
      store.createBlock({ id: "new-1", sortRank: "a0" });

      await vi.advanceTimersByTimeAsync(100);

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO blocks"),
        expect.arrayContaining(["new-1", "user-1", "page-1"]),
      );
    });
  });

  describe("deleteBlock", () => {
    it("removes the block from the store", () => {
      store.hydrate([makeBlockRow({ id: "b1" })]);
      store.setEditorRef("b1", createMockEditor({ type: "doc", content: [] }));
      store.deleteBlock("b1");

      expect(store.has("b1")).toBe(false);
      expect(store.blockCount).toBe(0);
    });

    it("persists deletes in flushStructure", async () => {
      store.hydrate([makeBlockRow({ id: "b1" })]);
      (db as any).__seed([{ id: "b1", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }) }]);
      store.setEditorRef("b1", createMockEditor());
      store.deleteBlock("b1");

      await vi.advanceTimersByTimeAsync(100);

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM blocks"),
        ["b1"],
      );
    });

    it("skips DB delete for blocks created and deleted in same window", async () => {
      store.hydrate([]);
      const id = store.createBlock({ sortRank: "a0" });
      store.deleteBlock(id);

      await vi.advanceTimersByTimeAsync(100);

      const deleteCalls = vi.mocked(db.execute).mock.calls.filter(
        (c) => (c[0] as string).includes("DELETE FROM blocks")
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  describe("net-zero flush (edit + undo within debounce window)", () => {
    const originalDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }] };

    function sqlCalls(fragment: string) {
      return vi.mocked(db.execute).mock.calls.filter((c) => (c[0] as string).includes(fragment));
    }

    it("writes nothing when a split is undone before the flush fires", async () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0", content: JSON.stringify(originalDoc) })]);
      (db as any).__seed([{ id: "b1", content: JSON.stringify(originalDoc), sort_rank: "a0" }]);
      store.setEditorRef("b1", createLiveMockEditor(originalDoc));

      const newId = store.splitBlock({
        sourceBlockId: "b1",
        leftContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] },
        rightContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " world" }] }] },
        newSortRank: "a0z",
      });
      store.undo();

      await vi.advanceTimersByTimeAsync(100);

      expect(store.has(newId)).toBe(false);
      expect(sqlCalls("INSERT INTO blocks")).toHaveLength(0);
      expect(sqlCalls("UPDATE blocks SET content")).toHaveLength(0);
      expect(sqlCalls("DELETE FROM blocks")).toHaveLength(0);
      // onPersisted (page timestamp bump) must not fire when nothing was written
      expect(sqlCalls("UPDATE pages SET updated_at")).toHaveLength(0);
    });

    it("writes nothing when a content change is undone before the flush fires", async () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0", content: JSON.stringify(originalDoc) })]);
      (db as any).__seed([{ id: "b1", content: JSON.stringify(originalDoc), sort_rank: "a0" }]);
      const editor = createLiveMockEditor(originalDoc);
      store.setEditorRef("b1", editor);

      const prevContent = store.getContent("b1");
      // Simulate an edit committed for undo, then reverted.
      editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "changed" }] }] });
      store.commitContent("b1");
      store.recordContentChange("b1", prevContent);
      store.undo();

      await vi.advanceTimersByTimeAsync(100);

      expect(sqlCalls("UPDATE blocks SET content")).toHaveLength(0);
      expect(sqlCalls("UPDATE pages SET updated_at")).toHaveLength(0);
    });

    it("still writes a genuine change that is not undone", async () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0", content: JSON.stringify(originalDoc) })]);
      (db as any).__seed([{ id: "b1", content: JSON.stringify(originalDoc), sort_rank: "a0" }]);
      const editor = createLiveMockEditor(originalDoc);
      store.setEditorRef("b1", editor);

      editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "changed" }] }] });
      store.commitContent("b1");

      await vi.advanceTimersByTimeAsync(100);

      expect(sqlCalls("UPDATE blocks SET content").length).toBeGreaterThan(0);
      expect(sqlCalls("UPDATE pages SET updated_at").length).toBeGreaterThan(0);
    });
  });

  describe("flush failure handling", () => {
    function sqlCalls(fragment: string) {
      return vi.mocked(db.execute).mock.calls.filter((c) => (c[0] as string).includes(fragment));
    }

    it("retains pending creates when the flush transaction fails, retrying on the next flush", async () => {
      store.hydrate([]);
      store.createBlock({ id: "new-1", sortRank: "a0" });

      // First flush: the write transaction rejects before anything is persisted.
      vi.mocked(db.writeTransaction).mockRejectedValueOnce(new Error("write failed"));
      await expect(store.flush()).rejects.toThrow("write failed");

      // Nothing was written, but the block is still in the store and still pending.
      expect(sqlCalls("INSERT INTO blocks")).toHaveLength(0);
      expect(store.has("new-1")).toBe(true);

      // A subsequent structural change triggers another flush, which must retry
      // the create that failed earlier (not silently drop it).
      store.createBlock({ id: "new-2", sortRank: "a1" });
      await store.flush();

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO blocks"),
        expect.arrayContaining(["new-1"]),
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO blocks"),
        expect.arrayContaining(["new-2"]),
      );
    });

    it("retains pending deletes when the flush transaction fails, retrying on the next flush", async () => {
      store.hydrate([makeBlockRow({ id: "b1" }), makeBlockRow({ id: "b2", sort_rank: "a1" })]);
      (db as any).__seed([
        { id: "b1", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }) },
        { id: "b2", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), sort_rank: "a1" },
      ]);
      store.setEditorRef("b1", createMockEditor());
      store.setEditorRef("b2", createMockEditor());
      store.deleteBlock("b1");

      // First flush fails.
      vi.mocked(db.writeTransaction).mockRejectedValueOnce(new Error("write failed"));
      await expect(store.flush()).rejects.toThrow("write failed");

      expect(sqlCalls("DELETE FROM blocks")).toHaveLength(0);

      // Next structural change retries the pending delete.
      store.deleteBlock("b2");
      await store.flush();

      expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM blocks"), ["b1"]);
      expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM blocks"), ["b2"]);
    });
  });

  describe("moveBlock", () => {
    it("updates parent and sort rank", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
      ]);

      store.moveBlock("b2", "b1", "a0z");
      const block = store.getBlock("b2")!;
      expect(block.parentId).toBe("b1");
      expect(block.sortRank).toBe("a0z");
    });

    it("is undoable", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1", parent_block_id: null }),
      ]);

      store.moveBlock("b2", "b1", "a0z");
      store.undo();

      const block = store.getBlock("b2")!;
      expect(block.parentId).toBeNull();
      expect(block.sortRank).toBe("a1");
    });
  });

  describe("splitBlock", () => {
    it("creates a new block and updates source content", () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0" })]);
      const editor = createMockEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }] });
      store.setEditorRef("b1", editor);

      const leftContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
      const rightContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " world" }] }] };

      const newId = store.splitBlock({
        sourceBlockId: "b1",
        leftContent,
        rightContent,
        newSortRank: "a0z",
      });

      expect(store.has(newId)).toBe(true);
      expect(store.blockCount).toBe(2);
      expect(editor.commands.setContent).toHaveBeenCalledWith(leftContent as any, { emitUpdate: false });
    });

    it("undo removes new block", () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0" })]);
      const editor = createMockEditor({ type: "doc", content: [] });
      store.setEditorRef("b1", editor);

      const newId = store.splitBlock({
        sourceBlockId: "b1",
        leftContent: { type: "doc", content: [] },
        rightContent: { type: "doc", content: [] },
        newSortRank: "a0z",
      });

      store.undo();
      expect(store.has(newId)).toBe(false);
      expect(store.blockCount).toBe(1);
    });
  });

  describe("mergeBlocks", () => {
    it("removes deleted block and updates target content", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
      ]);
      const targetEditor = createMockEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] });
      const deletedEditor = createMockEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " world" }] }] });
      store.setEditorRef("b1", targetEditor);
      store.setEditorRef("b2", deletedEditor);

      const mergedContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }] };

      store.mergeBlocks({
        targetBlockId: "b1",
        deletedBlockId: "b2",
        mergedContent,
      });

      expect(store.has("b2")).toBe(false);
      expect(store.blockCount).toBe(1);
      expect(targetEditor.commands.setContent).toHaveBeenCalledWith(mergedContent as any, { emitUpdate: false });
    });

    it("undo recreates deleted block and restores target content", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
      ]);
      const targetEditor = createMockEditor({ type: "doc", content: [] });
      const deletedEditor = createMockEditor({ type: "doc", content: [{ type: "paragraph" }] });
      store.setEditorRef("b1", targetEditor);
      store.setEditorRef("b2", deletedEditor);

      store.mergeBlocks({
        targetBlockId: "b1",
        deletedBlockId: "b2",
        mergedContent: { type: "doc", content: [] },
      });

      store.undo();
      expect(store.has("b2")).toBe(true);
      expect(store.blockCount).toBe(2);
    });
  });

  describe("moveBlockRange", () => {
    it("moves multiple blocks at once", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
        makeBlockRow({ id: "b3", sort_rank: "a2" }),
      ]);

      store.moveBlockRange([
        { blockId: "b2", newParentId: "b1", newSortRank: "a0a" },
        { blockId: "b3", newParentId: "b1", newSortRank: "a0b" },
      ]);

      expect(store.getBlock("b2")!.parentId).toBe("b1");
      expect(store.getBlock("b3")!.parentId).toBe("b1");
    });

    it("undoes all moves at once", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
        makeBlockRow({ id: "b3", sort_rank: "a2" }),
      ]);

      store.moveBlockRange([
        { blockId: "b2", newParentId: "b1", newSortRank: "a0a" },
        { blockId: "b3", newParentId: "b1", newSortRank: "a0b" },
      ]);

      store.undo();
      expect(store.getBlock("b2")!.parentId).toBeNull();
      expect(store.getBlock("b2")!.sortRank).toBe("a1");
      expect(store.getBlock("b3")!.parentId).toBeNull();
      expect(store.getBlock("b3")!.sortRank).toBe("a2");
    });
  });

  describe("deleteBlockRange", () => {
    it("removes all specified blocks", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
        makeBlockRow({ id: "b3", sort_rank: "a2" }),
      ]);
      store.setEditorRef("b1", createMockEditor());
      store.setEditorRef("b2", createMockEditor());
      store.setEditorRef("b3", createMockEditor());

      store.deleteBlockRange(["b1", "b2"]);
      expect(store.blockCount).toBe(1);
      expect(store.has("b3")).toBe(true);
    });

    it("undo restores all deleted blocks", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
      ]);
      store.setEditorRef("b1", createMockEditor());
      store.setEditorRef("b2", createMockEditor());

      store.deleteBlockRange(["b1", "b2"]);
      store.undo();

      expect(store.blockCount).toBe(2);
      expect(store.has("b1")).toBe(true);
      expect(store.has("b2")).toBe(true);
    });
  });

  describe("commitContent", () => {
    it("marks the block dirty for persistence", async () => {
      store.hydrate([makeBlockRow({ id: "b1" })]);
      const editor = createMockEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "updated" }] }] });
      store.setEditorRef("b1", editor);

      store.commitContent("b1");

      await vi.advanceTimersByTimeAsync(100);

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE blocks SET content"),
        expect.arrayContaining(["b1"]),
      );
    });
  });

  describe("query helpers", () => {
    it("getOrderedBlocks returns blocks sorted by sortRank", () => {
      store.hydrate([
        makeBlockRow({ id: "b2", sort_rank: "b" }),
        makeBlockRow({ id: "b1", sort_rank: "a" }),
        makeBlockRow({ id: "b3", sort_rank: "c" }),
      ]);

      const ordered = store.getOrderedBlocks();
      expect(ordered.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
    });

    it("getChildren filters by parentId", () => {
      store.hydrate([
        makeBlockRow({ id: "root", sort_rank: "a", parent_block_id: null }),
        makeBlockRow({ id: "child1", sort_rank: "b", parent_block_id: "root" }),
        makeBlockRow({ id: "child2", sort_rank: "c", parent_block_id: "root" }),
        makeBlockRow({ id: "other", sort_rank: "d", parent_block_id: null }),
      ]);

      const rootChildren = store.getChildren("root");
      expect(rootChildren.map((b) => b.id)).toEqual(["child1", "child2"]);

      const topLevel = store.getChildren(null);
      expect(topLevel.map((b) => b.id)).toEqual(["root", "other"]);
    });
  });

  describe("reconcile", () => {
    it("adds remotely created blocks", () => {
      store.hydrate([makeBlockRow({ id: "b1" })]);

      store.reconcile([
        makeBlockRow({ id: "b1" }),
        makeBlockRow({ id: "b2-remote", sort_rank: "a1" }),
      ] as any);

      expect(store.blockCount).toBe(2);
      expect(store.has("b2-remote")).toBe(true);
    });

    it("removes remotely deleted blocks", () => {
      store.hydrate([
        makeBlockRow({ id: "b1" }),
        makeBlockRow({ id: "b2" }),
      ]);

      store.reconcile([makeBlockRow({ id: "b1" })] as any);
      expect(store.blockCount).toBe(1);
      expect(store.has("b2")).toBe(false);
    });

    it("does not remove locally created blocks not yet in remote", () => {
      store.hydrate([]);
      store.createBlock({ id: "local-new", sortRank: "a0" });

      store.reconcile([] as any);
      expect(store.has("local-new")).toBe(true);
    });

    it("updates structural metadata from remote for non-dirty blocks", () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0", parent_block_id: null })]);

      store.reconcile([
        makeBlockRow({ id: "b1", sort_rank: "b0", parent_block_id: "parent-1" }),
      ] as any);

      expect(store.getBlock("b1")!.sortRank).toBe("b0");
      expect(store.getBlock("b1")!.parentId).toBe("parent-1");
    });
  });

  describe("callbacks", () => {
    it("calls onContentRestored on undo of merge", () => {
      const onContentRestored = vi.fn();
      const s = new NoteBlockStore("page-1", { debounceMs: 100, onContentRestored });

      s.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
      ]);
      s.setEditorRef("b1", createMockEditor());
      s.setEditorRef("b2", createMockEditor());

      s.mergeBlocks({ targetBlockId: "b1", deletedBlockId: "b2", mergedContent: { type: "doc", content: [] } });
      s.undo();

      expect(onContentRestored).toHaveBeenCalledWith("b1", expect.any(String));
      s.dispose();
    });

    it("calls onBlockRemoved on undo of create", () => {
      const onBlockRemoved = vi.fn();
      const s = new NoteBlockStore("page-1", { debounceMs: 100, onBlockRemoved });

      s.hydrate([]);
      const id = s.createBlock({ sortRank: "a0" });
      s.undo();

      expect(onBlockRemoved).toHaveBeenCalledWith(id);
      s.dispose();
    });
  });

  describe("setBlockType", () => {
    it("updates the node type", () => {
      store.hydrate([makeBlockRow({ id: "b1", type: "text" })]);

      store.setBlockType("b1", "heading");
      expect(store.getBlock("b1")!.type).toBe("heading");
    });

    it("does nothing for non-existent block", () => {
      store.hydrate([]);
      expect(() => store.setBlockType("missing", "heading")).not.toThrow();
    });
  });

  describe("moveBlockSilent", () => {
    it("moves block without pushing undo command", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1", parent_block_id: null }),
      ]);

      store.moveBlockSilent("b2", "b1", "a0z");

      expect(store.getBlock("b2")!.parentId).toBe("b1");
      expect(store.getBlock("b2")!.sortRank).toBe("a0z");
      expect(store.canUndo).toBe(false);
    });

    it("marks block dirty for persistence", async () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
      ]);

      store.moveBlockSilent("b2", "b1", "a0z");
      expect(store.hasPendingWrites("b2")).toBe(true);
    });
  });

  describe("recordContentChange", () => {
    it("pushes an undoable content-change command", () => {
      store.hydrate([makeBlockRow({ id: "b1", type: "text" })]);
      const editor = createMockEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }] });
      store.setEditorRef("b1", editor);

      const prevContent = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
      store.recordContentChange("b1", prevContent, "text");

      expect(store.canUndo).toBe(true);
    });

    it("undo restores previous content via editor", () => {
      store.hydrate([makeBlockRow({ id: "b1", type: "text" })]);
      const editor = createMockEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }] });
      store.setEditorRef("b1", editor);

      const prevContent = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
      store.recordContentChange("b1", prevContent, "heading");

      store.undo();

      expect(editor.commands.setContent).toHaveBeenCalledWith(
        { type: "doc", content: [{ type: "paragraph" }] },
        { emitUpdate: false },
      );
      expect(store.getBlock("b1")!.type).toBe("heading");
    });
  });

  describe("redo scenarios", () => {
    it("redo of split recreates the new block", () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0" })]);
      const editor = createMockEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }] });
      store.setEditorRef("b1", editor);

      const leftContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
      const rightContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " world" }] }] };

      const newId = store.splitBlock({
        sourceBlockId: "b1",
        leftContent,
        rightContent,
        newSortRank: "a0z",
      });

      store.undo();
      expect(store.has(newId)).toBe(false);

      store.redo();
      expect(store.has(newId)).toBe(true);
      expect(store.blockCount).toBe(2);
      expect(editor.commands.setContent).toHaveBeenLastCalledWith(leftContent as any, { emitUpdate: false });
    });

    it("redo of merge re-removes the deleted block", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
      ]);
      const targetEditor = createMockEditor({ type: "doc", content: [] });
      const deletedEditor = createMockEditor({ type: "doc", content: [] });
      store.setEditorRef("b1", targetEditor);
      store.setEditorRef("b2", deletedEditor);

      const mergedContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "merged" }] }] };
      store.mergeBlocks({ targetBlockId: "b1", deletedBlockId: "b2", mergedContent });

      store.undo();
      expect(store.has("b2")).toBe(true);

      store.redo();
      expect(store.has("b2")).toBe(false);
      expect(targetEditor.commands.setContent).toHaveBeenLastCalledWith(mergedContent as any, { emitUpdate: false });
    });

    it("redo of delete re-deletes the block", () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0" })]);
      store.setEditorRef("b1", createMockEditor());

      store.deleteBlock("b1");
      store.undo();
      expect(store.has("b1")).toBe(true);

      store.redo();
      expect(store.has("b1")).toBe(false);
    });

    it("redo of create recreates the block", () => {
      store.hydrate([]);
      const id = store.createBlock({ sortRank: "a0" });

      store.undo();
      expect(store.has(id)).toBe(false);

      store.redo();
      expect(store.has(id)).toBe(true);
    });

    it("redo of create restores full snapshot (parentId, sortRank, type)", () => {
      store.hydrate([makeBlockRow({ id: "parent", sort_rank: "a0" })]);
      const id = store.createBlock({ parentId: "parent", sortRank: "b5", type: "heading" });

      store.undo();
      store.redo();

      const block = store.getBlock(id)!;
      expect(block.parentId).toBe("parent");
      expect(block.sortRank).toBe("b5");
      expect(block.type).toBe("heading");
    });

    it("redo of move re-applies the move", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1", parent_block_id: null }),
      ]);

      store.moveBlock("b2", "b1", "a0z");
      store.undo();

      expect(store.getBlock("b2")!.parentId).toBeNull();
      expect(store.getBlock("b2")!.sortRank).toBe("a1");

      store.redo();
      expect(store.getBlock("b2")!.parentId).toBe("b1");
      expect(store.getBlock("b2")!.sortRank).toBe("a0z");
    });

    it("redo of moveBlockRange re-applies all moves", () => {
      store.hydrate([
        makeBlockRow({ id: "b1", sort_rank: "a0" }),
        makeBlockRow({ id: "b2", sort_rank: "a1" }),
        makeBlockRow({ id: "b3", sort_rank: "a2" }),
      ]);

      store.moveBlockRange([
        { blockId: "b2", newParentId: "b1", newSortRank: "a0a" },
        { blockId: "b3", newParentId: "b1", newSortRank: "a0b" },
      ]);

      store.undo();
      expect(store.getBlock("b2")!.parentId).toBeNull();
      expect(store.getBlock("b3")!.parentId).toBeNull();

      store.redo();
      expect(store.getBlock("b2")!.parentId).toBe("b1");
      expect(store.getBlock("b2")!.sortRank).toBe("a0a");
      expect(store.getBlock("b3")!.parentId).toBe("b1");
      expect(store.getBlock("b3")!.sortRank).toBe("a0b");
    });

    it("redo of content-change restores next content and type", () => {
      store.hydrate([makeBlockRow({ id: "b1", type: "text" })]);
      const editor = createMockEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }] });
      store.setEditorRef("b1", editor);

      const prevContent = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
      store.setBlockType("b1", "heading");
      store.recordContentChange("b1", prevContent, "text");

      store.undo();
      expect(store.getBlock("b1")!.type).toBe("text");

      store.redo();
      expect(store.getBlock("b1")!.type).toBe("heading");
      // Editor should have been called with the next content
      const lastCall = editor.commands.setContent.mock.calls.at(-1);
      expect(lastCall?.[0]).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }] });
    });
  });

  describe("getContent", () => {
    it("returns content from live editor", () => {
      store.hydrate([makeBlockRow({ id: "b1" })]);
      const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "live" }] }] };
      store.setEditorRef("b1", createMockEditor(content));

      const result = store.getContent("b1");
      expect(result).toBe(JSON.stringify(content));
    });

    it("returns content from pendingInitialContent when no editor", () => {
      const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "initial" }] }] };
      store.hydrate([makeBlockRow({ id: "b1", content: JSON.stringify(content) })]);

      // No editor set — should fall back to pending initial content
      const result = store.getContent("b1");
      expect(result).toBe(JSON.stringify(content));
    });

    it("returns empty doc for block without editor or initial content", () => {
      store.hydrate([makeBlockRow({ id: "b1" })]);
      store.consumeInitialContent("b1");

      const result = store.getContent("b1");
      expect(result).toBe(JSON.stringify({ type: "doc", content: [] }));
    });
  });

  describe("reconcile advanced", () => {
    it("skips blocks pending local deletion", () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0" })]);
      store.setEditorRef("b1", createMockEditor());

      // Delete locally (pending delete not yet flushed)
      store.deleteBlock("b1");
      expect(store.has("b1")).toBe(false);

      // Remote still shows the block — reconcile should NOT recreate it
      store.reconcile([makeBlockRow({ id: "b1", sort_rank: "a0" })] as any);
      expect(store.has("b1")).toBe(false);
    });

    it("updates live editor content on remote change", () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0" })]);
      const editor = createMockEditor({ type: "doc", content: [{ type: "paragraph" }] });
      store.setEditorRef("b1", editor);
      store.consumeInitialContent("b1");

      // Remote sends different content
      const remoteContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "remote" }] }] };
      store.reconcile([makeBlockRow({ id: "b1", sort_rank: "a0", content: JSON.stringify(remoteContent) })] as any);

      expect(editor.commands.setContent).toHaveBeenCalledWith(remoteContent, { emitUpdate: false });
    });

    it("updates pendingInitialContent when no editor is mounted", () => {
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0" })]);
      // No editor set

      const remoteContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "updated" }] }] };
      store.reconcile([makeBlockRow({ id: "b1", sort_rank: "a0", content: JSON.stringify(remoteContent) })] as any);

      expect(store.getInitialContent("b1")).toEqual(remoteContent);
    });

    it("skips normalization and editor update when content matches cache (fast-path)", () => {
      const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
      const serialized = JSON.stringify(content);
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0", content: serialized })]);
      const editor = createMockEditor(content);
      store.setEditorRef("b1", editor);
      store.consumeInitialContent("b1");

      // Populate the contentCache by reading content
      store.getContent("b1");

      // Reconcile with the exact same content string — fast-path should skip setContent
      store.reconcile([makeBlockRow({ id: "b1", sort_rank: "a0", content: serialized })] as any);

      expect(editor.commands.setContent).not.toHaveBeenCalled();
    });

    it("setContentDirect normalizes note-doc content for non-editor blocks (query blocks)", () => {
      const initialDoc = { type: "doc", content: [{ type: "queryBlock", attrs: { filters: [], columns: [], sort: null, limit: 20 } }] };
      store.hydrate([makeBlockRow({ id: "b1", sort_rank: "a0", type: "query", content: JSON.stringify(initialDoc) })]);
      // No editor ref set — simulates a query block

      const nextDoc = { type: "doc", content: [{ type: "queryBlock", attrs: { filters: [{ propertyId: "__title__", operator: "contains" }], columns: ["__created_at__"], limit: 20 } }] };
      store.setContentDirect("b1", nextDoc as any);

      // Content is stored as a normalized note document (queryBlock node preserved)
      expect(store.getContent("b1")).toBe(JSON.stringify(nextDoc));
    });

    it("preserves query block config across hydrate (refresh) without wiping it", () => {
      const doc = { type: "doc", content: [{ type: "queryBlock", attrs: { filters: [{ propertyId: "__title__", operator: "contains", value: "x" }], columns: ["__created_at__"], limit: 20 } }] };
      store.hydrate([makeBlockRow({ id: "q1", sort_rank: "a0", type: "query", content: JSON.stringify(doc) })]);

      // On refresh, getContent must return the query document, not an empty doc.
      expect(store.getContent("q1")).toBe(JSON.stringify(doc));
    });

    it("preserves remotely created query block config via reconcile", () => {
      store.hydrate([]);
      const doc = { type: "doc", content: [{ type: "queryBlock", attrs: { filters: [], columns: ["__title__"], limit: 20 } }] };
      store.reconcile([makeBlockRow({ id: "q2", sort_rank: "a0", type: "query", content: JSON.stringify(doc) })] as any);

      expect(store.getContent("q2")).toBe(JSON.stringify(doc));
    });
  });

  describe("store registry", () => {
    it("getNoteBlockStore returns same instance for same pageId", async () => {
      const { getNoteBlockStore, disposeNoteBlockStore } = await import("@/lib/notes/note-block-store");

      const store1 = getNoteBlockStore("registry-test-1", { debounceMs: 100 });
      const store2 = getNoteBlockStore("registry-test-1");

      expect(store1).toBe(store2);
      disposeNoteBlockStore("registry-test-1");
    });

    it("disposeNoteBlockStore removes instance from registry", async () => {
      const { getNoteBlockStore, disposeNoteBlockStore } = await import("@/lib/notes/note-block-store");

      const store1 = getNoteBlockStore("registry-test-2", { debounceMs: 100 });
      disposeNoteBlockStore("registry-test-2");
      const store2 = getNoteBlockStore("registry-test-2", { debounceMs: 100 });

      expect(store1).not.toBe(store2);
      disposeNoteBlockStore("registry-test-2");
    });
  });
});
