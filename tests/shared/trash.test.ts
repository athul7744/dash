/// <reference types="vitest/globals" />

const executed: { sql: string; params: unknown[] }[] = [];

vi.mock("@/lib/powersync/db", () => ({
  db: {
    execute: vi.fn((sql: string, params: unknown[] = []) => {
      executed.push({ sql, params });
      return Promise.resolve(undefined);
    }),
    getAll: vi.fn(async () => [] as unknown[]),
  },
}));
vi.mock("@/lib/shared/debounced-update", () => ({ SQL_UTC_NOW_EXPRESSION: "NOW()" }));

const deleteBookmark = vi.fn((..._a: unknown[]) => Promise.resolve());
const deleteQuote = vi.fn((..._a: unknown[]) => Promise.resolve());
const deleteEvent = vi.fn((..._a: unknown[]) => Promise.resolve());
const deleteNotePage = vi.fn((..._a: unknown[]) => Promise.resolve());
const deleteEntityEdges = vi.fn((..._a: unknown[]) => Promise.resolve());
const deleteEntityTags = vi.fn((..._a: unknown[]) => Promise.resolve());
const deleteSubjectOccurrences = vi.fn((..._a: unknown[]) => Promise.resolve());

vi.mock("@/lib/bookmarks/bookmarks", () => ({ deleteBookmark: (...a: unknown[]) => deleteBookmark(...a) }));
vi.mock("@/lib/quotes/quotes", () => ({ deleteQuote: (...a: unknown[]) => deleteQuote(...a) }));
vi.mock("@/lib/events/events", () => ({
  deleteEvent: (...a: unknown[]) => deleteEvent(...a),
  deleteSubjectOccurrences: (...a: unknown[]) => deleteSubjectOccurrences(...a),
}));
vi.mock("@/lib/notes/notes", () => ({ deleteNotePage: (...a: unknown[]) => deleteNotePage(...a) }));
vi.mock("@/lib/links/links", () => ({ deleteEntityEdges: (...a: unknown[]) => deleteEntityEdges(...a) }));
vi.mock("@/lib/tags/entity-tags", () => ({ deleteEntityTags: (...a: unknown[]) => deleteEntityTags(...a) }));

import { softDeleteEntity, restoreEntity, purgeEntity, cascadeOccurrences } from "@/lib/shared/trash";
import { db } from "@/lib/powersync/db";

beforeEach(() => {
  executed.length = 0;
  vi.clearAllMocks();
});

const sqlsMatching = (needle: string) => executed.filter((e) => e.sql.includes(needle));

describe("softDeleteEntity", () => {
  it("stamps deleted_at + updated_at on a block entity and cascades occurrences", async () => {
    await softDeleteEntity("bookmark", "b1");
    const blockUpdate = sqlsMatching("UPDATE blocks SET deleted_at = NOW()").find((e) => e.sql.includes("WHERE id = ?"));
    expect(blockUpdate).toBeTruthy();
    expect(blockUpdate!.sql).toContain("updated_at = NOW()");
    expect(blockUpdate!.params).toEqual(["b1"]);
    // Occurrence cascade: sets deleted_at on this subject's still-live occurrences.
    const occ = sqlsMatching("type = 'occurrence'").find((e) => e.sql.includes("deleted_at IS NULL"));
    expect(occ).toBeTruthy();
    expect(occ!.params).toEqual(["b1"]);
  });

  it("soft-deletes a note via the pages table", async () => {
    await softDeleteEntity("note", "n1");
    const pageUpdate = sqlsMatching("UPDATE pages SET deleted_at = NOW()")[0];
    expect(pageUpdate.params).toEqual(["n1"]);
  });

  it("trashes a task via state, cascading subtasks in one statement", async () => {
    await softDeleteEntity("task", "t1");
    const taskUpdate = sqlsMatching("UPDATE tasks SET state = 'trashed'")[0];
    expect(taskUpdate.sql).toContain("WHERE id = ? OR parent_id = ?");
    expect(taskUpdate.params).toEqual(["t1", "t1"]);
  });
});

describe("restoreEntity", () => {
  it("clears deleted_at on a block and its occurrences", async () => {
    await restoreEntity("event", "e1");
    expect(sqlsMatching("UPDATE blocks SET deleted_at = NULL").some((e) => e.params[0] === "e1")).toBe(true);
    const occ = sqlsMatching("type = 'occurrence'").find((e) => e.sql.includes("deleted_at IS NOT NULL"));
    expect(occ!.params).toEqual(["e1"]);
  });

  it("restores a task to pending only from trashed", async () => {
    await restoreEntity("task", "t1");
    const upd = sqlsMatching("UPDATE tasks SET state = 'pending'")[0];
    expect(upd.sql).toContain("AND state = 'trashed'");
    expect(upd.params).toEqual(["t1", "t1"]);
  });
});

describe("cascadeOccurrences", () => {
  it("only touches still-live rows when hiding, still-flagged rows when restoring", async () => {
    await cascadeOccurrences("s1", true);
    expect(executed[0].sql).toContain("deleted_at IS NULL");
    executed.length = 0;
    await cascadeOccurrences("s1", false);
    expect(executed[0].sql).toContain("deleted_at IS NOT NULL");
  });
});

describe("purgeEntity", () => {
  it("delegates each kind to its existing hard-delete", async () => {
    await purgeEntity("bookmark", "b");
    expect(deleteBookmark).toHaveBeenCalledWith("b");
    await purgeEntity("quote", "q");
    expect(deleteQuote).toHaveBeenCalledWith("q");
    await purgeEntity("event", "e");
    expect(deleteEvent).toHaveBeenCalledWith("e");
    await purgeEntity("note", "n");
    expect(deleteNotePage).toHaveBeenCalledWith("n");
  });

  it("hard-deletes a task with its subtasks and full fan-out", async () => {
    (db.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);
    await purgeEntity("task", "t");
    const del = sqlsMatching("DELETE FROM tasks")[0];
    expect(del.sql).toContain("WHERE id = ? OR parent_id = ?");
    expect(del.params).toEqual(["t", "t"]);
    // Fan-out runs for the root + both children.
    expect(deleteEntityEdges).toHaveBeenCalledTimes(3);
    expect(deleteSubjectOccurrences).toHaveBeenCalledTimes(3);
    expect(deleteEntityTags).toHaveBeenCalledTimes(3);
  });
});
