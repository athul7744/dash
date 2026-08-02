/// <reference types="vitest/globals" />

export {};

import { vi } from "vitest";

// setEntityTags resolves the user id for inserts — stub it (no Supabase in tests).
vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId: () => Promise.resolve("user-1") }));

import { setEntityTags, deleteEntityTags, deleteTagLinks } from "@/lib/tags/entity-tags";

type Row = { id: string; user_id: string; entity_id: string; entity_kind: string; tag_id: string };

/** A tiny in-memory stand-in for the entity_tags table + the owning-row bump. */
function makeCtx() {
  const rows: Row[] = [];
  const bumps: Array<{ table: string; id: string }> = [];
  const ctx = {
    async getAll<T>(_sql: string, params: unknown[] = []): Promise<T[]> {
      const entityId = params[0];
      return rows.filter((r) => r.entity_id === entityId).map((r) => ({ id: r.id, tag_id: r.tag_id })) as T[];
    },
    async execute(sql: string, params: unknown[] = []): Promise<unknown> {
      if (sql.startsWith("DELETE FROM entity_tags WHERE id =")) {
        const i = rows.findIndex((r) => r.id === params[0]);
        if (i >= 0) rows.splice(i, 1);
      } else if (sql.startsWith("DELETE FROM entity_tags WHERE entity_id =")) {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].entity_id === params[0]) rows.splice(i, 1);
      } else if (sql.startsWith("DELETE FROM entity_tags WHERE tag_id =")) {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].tag_id === params[0]) rows.splice(i, 1);
      } else if (sql.startsWith("INSERT INTO entity_tags")) {
        const [id, user_id, entity_id, entity_kind, tag_id] = params as string[];
        rows.push({ id, user_id, entity_id, entity_kind, tag_id });
      } else if (sql.startsWith("UPDATE ")) {
        bumps.push({ table: sql.split(/\s+/)[1], id: params[0] as string });
      }
      return undefined;
    },
  };
  const tagIds = () => rows.filter((r) => r.entity_id).map((r) => r.tag_id).sort();
  return { ctx, rows, bumps, tagIds };
}

describe("setEntityTags — add", () => {
  it("adds membership rows and bumps the owning row", async () => {
    const { ctx, rows, bumps, tagIds } = makeCtx();
    await setEntityTags("t1", "task", ["a", "b"], ctx);
    expect(tagIds()).toEqual(["a", "b"]);
    expect(rows.every((r) => r.entity_kind === "task" && r.user_id === "user-1")).toBe(true);
    expect(bumps).toEqual([{ table: "tasks", id: "t1" }]);
  });

  it("dedupes repeated tag ids", async () => {
    const { ctx, tagIds } = makeCtx();
    await setEntityTags("t1", "task", ["a", "a", "b"], ctx);
    expect(tagIds()).toEqual(["a", "b"]);
  });

  it("bumps the right table per kind", async () => {
    for (const [kind, table] of [["bookmark", "blocks"], ["event", "blocks"], ["note", "pages"]] as const) {
      const { ctx, bumps } = makeCtx();
      await setEntityTags("e1", kind, ["x"], ctx);
      expect(bumps).toEqual([{ table, id: "e1" }]);
    }
  });

  it("ids are deterministic (stable across runs)", async () => {
    const a = makeCtx();
    const b = makeCtx();
    await setEntityTags("t1", "task", ["a"], a.ctx);
    await setEntityTags("t1", "task", ["a"], b.ctx);
    expect(a.rows[0].id).toBe(b.rows[0].id);
  });
});

describe("setEntityTags — edit", () => {
  it("adds and removes to match the new set (diff), bumping once", async () => {
    const { ctx, bumps, tagIds } = makeCtx();
    await setEntityTags("t1", "task", ["a", "b"], ctx);
    await setEntityTags("t1", "task", ["b", "c"], ctx); // drop a, add c
    expect(tagIds()).toEqual(["b", "c"]);
    expect(bumps).toHaveLength(2); // one bump per changing call
  });

  it("re-applying the same set is a no-op (no bump)", async () => {
    const { ctx, bumps, tagIds } = makeCtx();
    await setEntityTags("t1", "task", ["a", "b"], ctx);
    await setEntityTags("t1", "task", ["a", "b"], ctx);
    expect(tagIds()).toEqual(["a", "b"]);
    expect(bumps).toHaveLength(1); // only the first call changed anything
  });

  it("kept rows are not re-inserted (stable id) while others change", async () => {
    const { ctx, rows } = makeCtx();
    await setEntityTags("t1", "task", ["a"], ctx);
    const keptId = rows.find((r) => r.tag_id === "a")!.id;
    await setEntityTags("t1", "task", ["a", "b"], ctx);
    expect(rows.find((r) => r.tag_id === "a")!.id).toBe(keptId);
  });
});

describe("setEntityTags / deleteEntityTags / deleteTagLinks — delete", () => {
  it("clearing to an empty set removes all rows and bumps", async () => {
    const { ctx, bumps, tagIds } = makeCtx();
    await setEntityTags("t1", "task", ["a", "b"], ctx);
    await setEntityTags("t1", "task", [], ctx);
    expect(tagIds()).toEqual([]);
    expect(bumps).toHaveLength(2);
  });

  it("deleteEntityTags removes every row for the entity (other entities untouched)", async () => {
    const { ctx, rows } = makeCtx();
    await setEntityTags("t1", "task", ["a", "b"], ctx);
    await setEntityTags("t2", "task", ["a"], ctx);
    await deleteEntityTags("t1", ctx);
    expect(rows.map((r) => r.entity_id)).toEqual(["t2"]);
  });

  it("deleteTagLinks removes the tag from every entity (cascade)", async () => {
    const { ctx, rows } = makeCtx();
    await setEntityTags("t1", "task", ["a", "b"], ctx);
    await setEntityTags("b1", "bookmark", ["a"], ctx);
    await deleteTagLinks("a", ctx);
    expect(rows.every((r) => r.tag_id !== "a")).toBe(true);
    expect(rows.map((r) => r.tag_id).sort()).toEqual(["b"]);
  });
});
