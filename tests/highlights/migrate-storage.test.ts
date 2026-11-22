/// <reference types="vitest/globals" />

/**
 * The one-time move of the Year app's rows from `"major-event"` to `"highlight"`.
 *
 * What makes this worth testing carefully is the page id: `systemPageId` is a
 * `uuidv5` of `kind:user:key`, so the registry page cannot be renamed in place —
 * it has to be re-inserted under the new id with its blocks following it. Get
 * that wrong and every saved highlight silently disappears.
 */

vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), getAll: vi.fn() } }));

import { migrateHighlightStorage } from "@/lib/highlights/migrate-storage";
import { HIGHLIGHT_STORED_KIND } from "@/lib/highlights/highlights";
import { systemPageId, type SystemPageKind } from "@/lib/notes/system-pages";
import type { DbContext } from "@/lib/links/links";

const USER = "user-1";
// The kind the union no longer names, which is exactly why this migration exists.
const OLD_PAGE = systemPageId(USER, "major-event" as SystemPageKind, "year");
const NEW_PAGE = systemPageId(USER, HIGHLIGHT_STORED_KIND, "year");

type PageRow = {
  id: string;
  user_id: string;
  title: string | null;
  properties: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

/** Just the tables and statements this migration touches. */
function makeCtx(seed: { page?: boolean; blocks?: string[] } = {}) {
  const pages: PageRow[] = seed.page === false
    ? []
    : [{
        id: OLD_PAGE,
        user_id: USER,
        title: "Highlights",
        properties: JSON.stringify({ kind: "major-event", key: "year" }),
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        deleted_at: null,
      }];
  const blocks = (seed.blocks ?? ["b1", "b2"]).map((id) => ({
    id,
    page_id: OLD_PAGE,
    type: id === "b2" ? "text" : "major-event",
  }));
  const entityTags = [
    { entity_id: "b1", entity_kind: "major-event" },
    { entity_id: "bookmark-1", entity_kind: "bookmark" },
  ];

  const ctx: DbContext = {
    async getAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.includes("json_extract(properties")) {
        return pages.filter(
          (p) => JSON.parse(p.properties ?? "{}").kind === params[0] && JSON.parse(p.properties ?? "{}").key === params[1],
        ) as T[];
      }
      if (sql.startsWith("SELECT id FROM pages WHERE id =")) {
        return pages.filter((p) => p.id === params[0]).map((p) => ({ id: p.id })) as T[];
      }
      if (sql.includes("count(*) AS c FROM blocks")) {
        return [{ c: blocks.filter((b) => b.page_id === params[0]).length }] as T[];
      }
      throw new Error(`unexpected SELECT: ${sql}`);
    },
    async execute(sql: string, params: unknown[] = []): Promise<unknown> {
      if (sql.startsWith("INSERT INTO pages") || sql.startsWith("INSERT OR IGNORE INTO pages")) {
        const [id, user_id, title, properties, created_at, updated_at, deleted_at] = params as string[];
        const ignore = sql.startsWith("INSERT OR IGNORE");
        if (ignore && pages.some((p) => p.id === id)) return undefined;
        pages.push({ id, user_id, title, properties, created_at, updated_at, deleted_at });
        return undefined;
      }
      if (sql.startsWith("UPDATE blocks SET page_id =")) {
        for (const b of blocks) if (b.page_id === params[1]) b.page_id = String(params[0]);
        return undefined;
      }
      if (sql.startsWith("DELETE FROM blocks WHERE page_id =")) {
        for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].page_id === params[0]) blocks.splice(i, 1);
        return undefined;
      }
      if (sql.startsWith("DELETE FROM pages WHERE id =")) {
        const i = pages.findIndex((p) => p.id === params[0]);
        if (i >= 0) pages.splice(i, 1);
        return undefined;
      }
      if (sql.startsWith("UPDATE blocks SET type =")) {
        for (const b of blocks) if (b.type === params[1]) b.type = String(params[0]);
        return undefined;
      }
      if (sql.startsWith("UPDATE entity_tags SET entity_kind =")) {
        for (const row of entityTags) if (row.entity_kind === params[1]) row.entity_kind = String(params[0]);
        return undefined;
      }
      throw new Error(`unexpected statement: ${sql}`);
    },
  };

  return { ctx, pages, blocks, entityTags };
}

describe("migrateHighlightStorage", () => {
  it("moves the registry page onto the new id, keeping its rows", async () => {
    const { ctx, pages, blocks } = makeCtx();
    const result = await migrateHighlightStorage(ctx);

    expect(result.migrated).toBe(true);
    expect(pages.map((p) => p.id)).toEqual([NEW_PAGE]);
    expect(JSON.parse(pages[0].properties ?? "{}")).toEqual({ kind: "highlight", key: "year" });
    // The page keeps its title and timestamps — this is a rename, not a rebuild.
    expect(pages[0].title).toBe("Highlights");
    expect(pages[0].updated_at).toBe("2026-01-02T00:00:00.000Z");
    expect(blocks.map((b) => b.page_id)).toEqual([NEW_PAGE, NEW_PAGE]);
  });

  it("retypes the highlight blocks and leaves other blocks alone", async () => {
    const { ctx, blocks } = makeCtx();
    await migrateHighlightStorage(ctx);

    expect(blocks.find((b) => b.id === "b1")?.type).toBe("highlight");
    // The starter `text` block on the same page is not a highlight.
    expect(blocks.find((b) => b.id === "b2")?.type).toBe("text");
  });

  it("retypes tag memberships, and only the highlight ones", async () => {
    const { ctx, entityTags } = makeCtx();
    await migrateHighlightStorage(ctx);

    expect(entityTags.find((r) => r.entity_id === "b1")?.entity_kind).toBe("highlight");
    expect(entityTags.find((r) => r.entity_id === "bookmark-1")?.entity_kind).toBe("bookmark");
  });

  it("is a no-op once there is nothing legacy left", async () => {
    const first = makeCtx();
    await migrateHighlightStorage(first.ctx);

    const second = await migrateHighlightStorage(first.ctx);
    expect(second.migrated).toBe(false);
    expect(first.pages.map((p) => p.id)).toEqual([NEW_PAGE]);
  });

  it("does nothing at all on a vault that never had a highlight", async () => {
    const { ctx, pages } = makeCtx({ page: false, blocks: [] });
    const result = await migrateHighlightStorage(ctx);

    expect(result.migrated).toBe(false);
    expect(pages).toHaveLength(0);
  });

  it("never deletes blocks when the new page already exists", async () => {
    const { ctx, pages, blocks } = makeCtx();
    // A newer build created the page first (or an overlapping run did): the new
    // row exists and is empty, while the legacy page still holds the real rows.
    pages.push({ ...pages[0], id: NEW_PAGE, properties: JSON.stringify({ kind: "highlight", key: "year" }) });

    await migrateHighlightStorage(ctx);

    expect(pages.filter((p) => p.id === NEW_PAGE)).toHaveLength(1);
    // The legacy page's blocks are the ones the tags point at, so they are moved
    // in, not thrown away with the page.
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.page_id)).toEqual([NEW_PAGE, NEW_PAGE]);
    expect(pages.some((p) => p.id === OLD_PAGE)).toBe(false);
  });

  it("leaves the legacy page alone while the new page still holds blocks", async () => {
    const { ctx, pages, blocks } = makeCtx();
    pages.push({ ...pages[0], id: NEW_PAGE, properties: JSON.stringify({ kind: "highlight", key: "year" }) });
    blocks.push({ id: "new-1", page_id: NEW_PAGE, type: "highlight" });

    await migrateHighlightStorage(ctx);

    // Nothing was deleted and nothing was moved onto a page that already had
    // rows: the next launch, once that page is empty, finishes the move.
    expect(blocks).toHaveLength(3);
    expect(pages.some((p) => p.id === OLD_PAGE)).toBe(true);
    expect(pages.filter((p) => p.id === NEW_PAGE)).toHaveLength(1);
  });
});
