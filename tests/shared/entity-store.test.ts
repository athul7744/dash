/// <reference types="vitest/globals" />

import { EntityStore, type EntityStoreConfig } from "@/lib/shared/entity-store";

// ─── Test subclass ────────────────────────────────────────────────────────────

interface TestNode {
  id: string;
  value: string;
}

type TestCommand =
  | { kind: "set-value"; id: string; prev: string }
  | { kind: "delete"; id: string; prev: TestNode }
  | { kind: "create"; id: string };

class TestStore extends EntityStore<TestNode, TestCommand> {
  flushCalls: { dirty: string[]; structure: boolean }[] = [];
  private structDirty = false;
  private pendingCreateIds = new Set<string>();

  constructor(config: EntityStoreConfig = {}) {
    super(config);
  }

  // Public helpers for testing
  addNode(id: string, value: string) {
    this.nodes.set(id, { id, value });
  }

  setValue(id: string, value: string) {
    const node = this.nodes.get(id);
    if (!node) return;
    const prev = node.value;
    node.value = value;
    this.pushCommand({ kind: "set-value", id, prev });
    this.markDirty(id);
    this.notify();
  }

  createNode(id: string, value: string) {
    this.nodes.set(id, { id, value });
    this.pendingCreateIds.add(id);
    this.pushCommand({ kind: "create", id });
    this.markStructureDirty();
    this.structDirty = true;
    this.notify();
  }

  deleteNode(id: string) {
    const node = this.nodes.get(id)!;
    this.pushCommand({ kind: "delete", id, prev: node });
    this.nodes.delete(id);
    this.markStructureDirty();
    this.structDirty = true;
    this.notify();
  }

  getNode(id: string) {
    return this.nodes.get(id);
  }

  get nodeCount() {
    return this.nodes.size;
  }

  // Abstract implementations
  protected async flushDirtyEntities(dirtyIds: Set<string>) {
    this.flushCalls.push({ dirty: [...dirtyIds], structure: false });
    return true;
  }

  protected async flushStructure() {
    this.flushCalls.push({ dirty: [], structure: true });
    this.structDirty = false;
    this.pendingCreateIds.clear();
    return true;
  }

  protected applyUndo(cmd: TestCommand) {
    switch (cmd.kind) {
      case "set-value": {
        const node = this.nodes.get(cmd.id);
        if (node) {
          node.value = cmd.prev;
          this.markDirty(cmd.id);
        }
        break;
      }
      case "delete": {
        this.nodes.set(cmd.id, cmd.prev);
        this.markStructureDirty();
        this.structDirty = true;
        break;
      }
      case "create": {
        this.nodes.delete(cmd.id);
        this.markStructureDirty();
        this.structDirty = true;
        break;
      }
    }
  }

  protected applyRedo(cmd: TestCommand) {
    switch (cmd.kind) {
      case "set-value": {
        // We don't store forward value — limited redo
        break;
      }
      case "delete": {
        this.nodes.delete(cmd.id);
        break;
      }
      case "create": {
        // We don't store the value — limited
        this.nodes.set(cmd.id, { id: cmd.id, value: "" });
        break;
      }
    }
  }

  protected reconcileNode(row: { id: string; value: string }) {
    const node = this.nodes.get(row.id);
    if (node) {
      node.value = row.value;
    } else {
      this.nodes.set(row.id, { id: row.id, value: row.value });
    }
  }

  protected onRemoteDelete(id: string) {
    this.nodes.delete(id);
  }

  protected isPendingCreate(id: string): boolean {
    return this.pendingCreateIds.has(id);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EntityStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("dirty tracking and debounced persist", () => {
    it("flushes dirty entities after debounce period", async () => {
      const store = new TestStore({ debounceMs: 100 });
      store.addNode("a", "hello");
      store.setValue("a", "world");

      expect(store.flushCalls).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(100);
      expect(store.flushCalls.length).toBeGreaterThanOrEqual(1);
      expect(store.flushCalls.some((c) => c.dirty.includes("a"))).toBe(true);
    });

    it("resets debounce timer on subsequent edits", async () => {
      const store = new TestStore({ debounceMs: 100 });
      store.addNode("a", "v1");
      store.setValue("a", "v2");

      await vi.advanceTimersByTimeAsync(50);
      store.setValue("a", "v3");

      await vi.advanceTimersByTimeAsync(50);
      // Should not have flushed yet (timer restarted)
      expect(store.flushCalls).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(50);
      expect(store.flushCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("reports hasPendingWrites correctly", () => {
      const store = new TestStore({ debounceMs: 500 });
      store.addNode("a", "x");

      expect(store.hasPendingWrites()).toBe(false);
      store.setValue("a", "y");
      expect(store.hasPendingWrites("a")).toBe(true);
      expect(store.hasPendingWrites("b")).toBe(false);
      expect(store.hasPendingWrites()).toBe(true);
    });

    it("flush() forces immediate persist", async () => {
      const store = new TestStore({ debounceMs: 1000 });
      store.addNode("a", "x");
      store.setValue("a", "y");

      await store.flush();
      expect(store.flushCalls.length).toBeGreaterThanOrEqual(1);
      expect(store.hasPendingWrites()).toBe(false);
    });
  });

  describe("undo / redo", () => {
    it("undoes a value change", () => {
      const store = new TestStore();
      store.addNode("a", "original");
      store.setValue("a", "changed");

      expect(store.getNode("a")!.value).toBe("changed");
      expect(store.canUndo).toBe(true);

      store.undo();
      expect(store.getNode("a")!.value).toBe("original");
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(true);
    });

    it("redoes an undone operation", () => {
      const store = new TestStore();
      store.addNode("a", "v1");
      store.setValue("a", "v2");

      store.undo();
      expect(store.getNode("a")!.value).toBe("v1");

      store.redo();
      // Redo for set-value is limited in our test impl, but the stack should be correct
      expect(store.canRedo).toBe(false);
      expect(store.canUndo).toBe(true);
    });

    it("clears redo stack on new command", () => {
      const store = new TestStore();
      store.addNode("a", "v1");
      store.setValue("a", "v2");
      store.undo();

      expect(store.canRedo).toBe(true);
      store.setValue("a", "v3");
      expect(store.canRedo).toBe(false);
    });

    it("undoes a delete (recreates node)", () => {
      const store = new TestStore();
      store.addNode("a", "hello");
      store.deleteNode("a");

      expect(store.nodeCount).toBe(0);
      store.undo();
      expect(store.nodeCount).toBe(1);
      expect(store.getNode("a")!.value).toBe("hello");
    });

    it("undoes a create (removes node)", () => {
      const store = new TestStore();
      store.createNode("a", "new");

      expect(store.nodeCount).toBe(1);
      store.undo();
      expect(store.nodeCount).toBe(0);
    });

    it("limits undo stack size", () => {
      const store = new TestStore();
      store.addNode("a", "v0");

      for (let i = 1; i <= 100; i++) {
        store.setValue("a", `v${i}`);
      }

      // Should have at most 80 undo entries
      let undoCount = 0;
      while (store.canUndo) {
        store.undo();
        undoCount++;
      }
      expect(undoCount).toBe(80);
    });
  });

  describe("subscription", () => {
    it("notifies subscribers on mutations", () => {
      const store = new TestStore();
      store.addNode("a", "v1");

      const listener = vi.fn();
      store.subscribe(listener);

      store.setValue("a", "v2");
      expect(listener).toHaveBeenCalled();
    });

    it("unsubscribe stops notifications", () => {
      const store = new TestStore();
      store.addNode("a", "v1");

      const listener = vi.fn();
      const unsub = store.subscribe(listener);

      store.setValue("a", "v2");
      const callsBeforeUnsub = listener.mock.calls.length;
      expect(callsBeforeUnsub).toBeGreaterThan(0);

      unsub();
      store.setValue("a", "v3");
      expect(listener).toHaveBeenCalledTimes(callsBeforeUnsub);
    });

    it("increments version on each notification", () => {
      const store = new TestStore();
      store.addNode("a", "v1");

      const v1 = store.version;
      store.setValue("a", "v2");
      expect(store.version).toBeGreaterThan(v1);
    });
  });

  describe("reconcile", () => {
    it("adds new remote nodes", () => {
      const store = new TestStore();
      store.addNode("a", "local");

      store.reconcile([
        { id: "a", value: "local" } as any,
        { id: "b", value: "remote-new" } as any,
      ]);

      expect(store.nodeCount).toBe(2);
      expect(store.getNode("b")!.value).toBe("remote-new");
    });

    it("updates non-dirty nodes from remote", () => {
      const store = new TestStore();
      store.addNode("a", "old");

      store.reconcile([{ id: "a", value: "updated-remote" } as any]);
      expect(store.getNode("a")!.value).toBe("updated-remote");
    });

    it("skips dirty nodes during reconcile", () => {
      const store = new TestStore({ debounceMs: 5000 });
      store.addNode("a", "local-edit");
      store.setValue("a", "local-edit"); // marks dirty

      store.reconcile([{ id: "a", value: "remote-value" } as any]);
      expect(store.getNode("a")!.value).toBe("local-edit");
    });

    it("removes nodes deleted remotely", () => {
      const store = new TestStore();
      store.addNode("a", "will-be-removed");
      store.addNode("b", "stays");

      store.reconcile([{ id: "b", value: "stays" } as any]);
      expect(store.nodeCount).toBe(1);
      expect(store.getNode("a")).toBeUndefined();
    });

    it("does not remove pending creates missing from remote", () => {
      const store = new TestStore();
      store.createNode("new-local", "optimistic");

      store.reconcile([]);
      expect(store.nodeCount).toBe(1);
      expect(store.getNode("new-local")).toBeDefined();
    });
  });

  describe("dispose", () => {
    it("clears timer and listeners", async () => {
      const store = new TestStore({ debounceMs: 100 });
      const listener = vi.fn();
      store.subscribe(listener);
      store.addNode("a", "x");
      store.setValue("a", "y");

      store.dispose();

      await vi.advanceTimersByTimeAsync(200);
      // No flush should have happened after dispose
      expect(store.flushCalls).toHaveLength(0);
    });
  });

  describe("onPersisted callback", () => {
    it("fires after successful persist", async () => {
      const onPersisted = vi.fn();
      const store = new TestStore({ debounceMs: 100, onPersisted });
      store.addNode("a", "hello");
      store.setValue("a", "world");

      await vi.advanceTimersByTimeAsync(100);
      expect(onPersisted).toHaveBeenCalledTimes(1);
    });

    it("fires once for combined dirty + structure persist", async () => {
      const onPersisted = vi.fn();
      const store = new TestStore({ debounceMs: 100, onPersisted });
      store.addNode("a", "x");
      store.setValue("a", "y"); // marks dirty
      store.createNode("b", "z"); // marks structure dirty

      await vi.advanceTimersByTimeAsync(100);
      expect(onPersisted).toHaveBeenCalledTimes(1);
      expect(store.flushCalls.some((c) => c.dirty.includes("a"))).toBe(true);
      expect(store.flushCalls.some((c) => c.structure)).toBe(true);
    });

    it("does not fire when nothing is dirty", async () => {
      const onPersisted = vi.fn();
      const store = new TestStore({ debounceMs: 100, onPersisted });
      store.addNode("a", "x");

      await store.flush();
      expect(onPersisted).not.toHaveBeenCalled();
    });
  });

  describe("undo triggers persist", () => {
    it("schedules persist after undo", async () => {
      const store = new TestStore({ debounceMs: 100 });
      store.addNode("a", "v1");
      store.setValue("a", "v2");

      // Flush initial write
      await vi.advanceTimersByTimeAsync(100);
      store.flushCalls.length = 0;

      store.undo();
      await vi.advanceTimersByTimeAsync(100);
      expect(store.flushCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
