/// <reference types="vitest/globals" />

/**
 * How the graph turns an edge row into two endpoints.
 *
 * The graph draws a link only when *both* ends resolve to a node it already
 * knows, so a wrong answer here doesn't misplace a line — it silently drops it,
 * and every item collapses into an orphan cluster. That failure looks like an
 * empty graph rather than a bug, which is why this is worth pinning down.
 */

import { resolveSource, resolveTarget, type EdgeResolveRow } from "@/hooks/use-note-graph";

const EMPTY: EdgeResolveRow = {
  s_raw: "source-1", t_raw: "target-1",
  s_task: null, s_block: null, s_page: null, s_page_kind: null,
  t_task: null, t_block: null, t_page: null, t_block_page_kind: null,
  t_page_direct: null, t_page_kind: null,
};

const row = (over: Partial<EdgeResolveRow>): EdgeResolveRow => ({ ...EMPTY, ...over });

describe("resolveSource", () => {
  it("collapses a note's block to its page", () => {
    // Edges are written per block, but the graph has one node per note.
    expect(resolveSource(row({ s_block: "b1", s_page: "p1" }))).toEqual({ id: "p1", kind: "note" });
  });

  it("reads a task by its own id", () => {
    expect(resolveSource(row({ s_task: "t1", s_raw: "t1" }))).toEqual({ id: "t1", kind: "task" });
  });

  it("collapses a journal block to the day", () => {
    expect(resolveSource(row({ s_block: "b1", s_page: "p1", s_page_kind: "journal" })))
      .toEqual({ id: "p1", kind: "day" });
  });

  it("keeps an app item its own node", () => {
    // A bookmark is a block on the bookmarks system page; it is the node, not
    // the page that holds it.
    expect(resolveSource(row({ s_raw: "bm1", s_block: "bm1", s_page: "sys", s_page_kind: "bookmark" })))
      .toEqual({ id: "bm1", kind: "bookmark" });
  });

  it("is nothing when the source row is gone", () => {
    expect(resolveSource(EMPTY)).toBeNull();
  });
});

describe("resolveTarget", () => {
  it("reads a note page referenced directly", () => {
    // This is the common case: `[[Page|note:<page id>]]` targets the page id.
    expect(resolveTarget(row({ t_page_direct: "p2", t_raw: "p2" }))).toEqual({ id: "p2", kind: "note" });
  });

  it("reads a journal page as a day", () => {
    expect(resolveTarget(row({ t_page_direct: "p2", t_raw: "p2", t_page_kind: "journal" })))
      .toEqual({ id: "p2", kind: "day" });
  });

  it("collapses a targeted block to its note", () => {
    expect(resolveTarget(row({ t_block: "b2", t_page: "p2" }))).toEqual({ id: "p2", kind: "note" });
  });

  it("keeps a targeted app item its own node", () => {
    expect(resolveTarget(row({ t_raw: "q1", t_block: "q1", t_page: "sys", t_block_page_kind: "quote" })))
      .toEqual({ id: "q1", kind: "quote" });
  });

  it("is nothing when the target no longer exists", () => {
    // A date chip targets a day's journal page before anything is written
    // there, so the row is absent — the edge is simply not drawn.
    expect(resolveTarget(EMPTY)).toBeNull();
  });
});

describe("a note linking a note", () => {
  it("resolves to a drawable pair", () => {
    const edge = row({ s_block: "b1", s_page: "p1", t_page_direct: "p2", t_raw: "p2" });
    expect(resolveSource(edge)).toEqual({ id: "p1", kind: "note" });
    expect(resolveTarget(edge)).toEqual({ id: "p2", kind: "note" });
  });
});
