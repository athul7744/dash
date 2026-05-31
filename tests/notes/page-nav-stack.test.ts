/// <reference types="vitest/globals" />

import { pushEntry, popEntry, popToEntry, type PageNavEntry } from "@/lib/notes/page-nav-stack";

function entry(id: string, title = `Page ${id}`): PageNavEntry {
  return { pageId: id, title };
}

describe("pushEntry", () => {
  it("adds an entry to an empty stack", () => {
    const result = pushEntry([], entry("a"));
    expect(result).toEqual([entry("a")]);
  });

  it("appends to an existing stack", () => {
    const result = pushEntry([entry("a")], entry("b"));
    expect(result).toEqual([entry("a"), entry("b")]);
  });

  it("returns the same array when pushing a duplicate of the top", () => {
    const stack = [entry("a"), entry("b")];
    const result = pushEntry(stack, entry("b", "Different title"));
    expect(result).toBe(stack);
  });

  it("allows pushing a duplicate that is not at the top", () => {
    const result = pushEntry([entry("a"), entry("b")], entry("a"));
    expect(result).toEqual([entry("a"), entry("b"), entry("a")]);
  });

  it("enforces max stack depth of 20", () => {
    let stack: PageNavEntry[] = [];
    for (let i = 0; i < 25; i++) {
      stack = pushEntry(stack, entry(String(i)));
    }
    expect(stack).toHaveLength(20);
    expect(stack[0].pageId).toBe("5");
    expect(stack[19].pageId).toBe("24");
  });
});

describe("popEntry", () => {
  it("returns undefined and same stack for empty stack", () => {
    const stack: PageNavEntry[] = [];
    const result = popEntry(stack);
    expect(result.popped).toBeUndefined();
    expect(result.stack).toBe(stack);
  });

  it("pops the last entry", () => {
    const result = popEntry([entry("a"), entry("b")]);
    expect(result.popped).toEqual(entry("b"));
    expect(result.stack).toEqual([entry("a")]);
  });

  it("pops the only entry", () => {
    const result = popEntry([entry("a")]);
    expect(result.popped).toEqual(entry("a"));
    expect(result.stack).toEqual([]);
  });
});

describe("popToEntry", () => {
  it("returns undefined for a pageId not in the stack", () => {
    const stack = [entry("a"), entry("b")];
    const result = popToEntry(stack, "z");
    expect(result.target).toBeUndefined();
    expect(result.stack).toBe(stack);
  });

  it("pops to a target in the middle, removing it and everything after", () => {
    const result = popToEntry([entry("a"), entry("b"), entry("c")], "b");
    expect(result.target).toEqual(entry("b"));
    expect(result.stack).toEqual([entry("a")]);
  });

  it("pops to the first entry, returning an empty stack", () => {
    const result = popToEntry([entry("a"), entry("b")], "a");
    expect(result.target).toEqual(entry("a"));
    expect(result.stack).toEqual([]);
  });

  it("pops to the last entry, removing only it", () => {
    const result = popToEntry([entry("a"), entry("b"), entry("c")], "c");
    expect(result.target).toEqual(entry("c"));
    expect(result.stack).toEqual([entry("a"), entry("b")]);
  });

  it("handles duplicate pageIds by finding the last occurrence", () => {
    const result = popToEntry([entry("a"), entry("b"), entry("a", "Second A")], "a");
    expect(result.target).toEqual(entry("a", "Second A"));
    expect(result.stack).toEqual([entry("a"), entry("b")]);
  });
});
