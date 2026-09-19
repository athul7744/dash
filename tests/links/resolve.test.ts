/// <reference types="vitest/globals" />

/**
 * Turning an edge endpoint back into the thing it points at.
 *
 * This is where a reference becomes a backlink and a graph node, so a row read
 * as the wrong kind sends the reader to the wrong place — silently, since every
 * kind renders the same shape.
 */

import { classifyEntityRow, type EntityJoinRow } from "@/lib/links/resolve";

const EMPTY: EntityJoinRow = {
  source_id: "source-1",
  task_id: null,
  task_title: null,
  block_id: null,
  block_type: null,
  block_content: null,
  page_id: null,
  page_title: null,
  page_kind: null,
};

const row = (over: Partial<EntityJoinRow>): EntityJoinRow => ({ ...EMPTY, ...over });

describe("classifyEntityRow", () => {
  it("collapses a block on a note page to the note", () => {
    const resolved = classifyEntityRow(
      row({ block_id: "b1", page_id: "p1", page_title: "Project", page_kind: null }),
    );
    expect(resolved).toEqual({ kind: "note", id: "p1", label: "Project" });
  });

  it("reads a journal page as a day, not a note", () => {
    // A day is anchored on the journal page that date owns. Before `day` existed
    // this fell through to the note branch, so a linked day opened as a page
    // called "Journal · …" and never appeared as a day anywhere.
    const resolved = classifyEntityRow(
      row({ block_id: "b1", page_id: "p1", page_title: "Journal · Tue, Sep 15, 2026", page_kind: "journal" }),
    );
    expect(resolved).toEqual({ kind: "day", id: "p1", label: "Tue, Sep 15, 2026" });
  });

  it("falls back to the whole title when a journal page isn't named the usual way", () => {
    const resolved = classifyEntityRow(
      row({ block_id: "b1", page_id: "p1", page_title: "Some day", page_kind: "journal" }),
    );
    expect(resolved?.label).toBe("Some day");
  });

  it("keeps a task a task", () => {
    const resolved = classifyEntityRow(row({ task_id: "t1", task_title: "Buy milk" }));
    expect(resolved).toEqual({ kind: "task", id: "source-1", label: "Buy milk" });
  });

  it("is nothing when the row resolves to no live entity", () => {
    // A soft-deleted source nulls its columns out, which is how trashed things
    // drop out of backlinks while their edges survive for a restore.
    expect(classifyEntityRow(EMPTY)).toBeNull();
    expect(classifyEntityRow(row({ block_id: "b1", page_id: null }))).toBeNull();
  });
});
