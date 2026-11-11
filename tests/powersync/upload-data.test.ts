/// <reference types="vitest/globals" />

/**
 * The sync write path, end to end below PowerSync: a local CRUD batch becomes
 * ordered Supabase requests.
 *
 * `upload-helpers.test.ts` covers the pure pieces in isolation. What it cannot
 * see is whether `uploadData` uses them — that the batch is collapsed before
 * it is grouped, that upserts run parent-before-child and deletes the reverse,
 * that JSON columns leave as JSONB, and that a failing request is classified
 * (drop the batch, retry it, or drop only the orphan) rather than left to wedge
 * the queue. One mistake here loses writes that already look saved locally.
 */

const hoisted = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@powersync/web", () => ({ UpdateType: { PUT: 1, PATCH: 2, DELETE: 3 } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => hoisted.client }));
vi.mock("@/lib/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { AbstractPowerSyncDatabase } from "@powersync/web";

import { SupabaseConnector } from "@/lib/powersync/SupabaseConnector";

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string };
type Result = { error: DbError | null };

type Call =
  | { kind: "upsert"; table: string; records: Row[] }
  | { kind: "delete"; table: string; ids: string[] }
  | { kind: "update"; table: string; data: Row; id: string };

interface CrudEntry {
  op: number;
  table: string;
  id: string;
  opData?: Row;
}

const PUT = 1;
const PATCH = 2;
const DELETE = 3;

/**
 * A Supabase browser client that records calls. `upsert` decides each response
 * so a test can inject an FK violation on the bulk request and then succeed
 * per row, which is the orphan-recovery path.
 */
function makeClient(upsert: (table: string, records: Row[]) => Result = () => ({ error: null })) {
  const calls: Call[] = [];

  const client = {
    from(table: string) {
      return {
        async upsert(records: Row[] | Row): Promise<Result> {
          const list = Array.isArray(records) ? records : [records];
          calls.push({ kind: "upsert", table, records: list });
          return upsert(table, list);
        },
        delete() {
          return {
            async in(_column: string, ids: string[]): Promise<Result> {
              calls.push({ kind: "delete", table, ids });
              return { error: null };
            },
          };
        },
        update(data: Row) {
          return {
            async eq(_column: string, id: string): Promise<Result> {
              calls.push({ kind: "update", table, data, id });
              return { error: null };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

function makeDatabase(crud: CrudEntry[]) {
  const complete = vi.fn(async () => {});
  const db = { getCrudBatch: vi.fn(async () => ({ crud, complete })) };
  return { db: db as unknown as AbstractPowerSyncDatabase, complete };
}

async function upload(crud: CrudEntry[], upsert?: (table: string, records: Row[]) => Result) {
  const { client, calls } = makeClient(upsert);
  hoisted.client = client;
  const { db, complete } = makeDatabase(crud);
  const connector = new SupabaseConnector();
  await connector.uploadData(db);
  return { calls, complete };
}

describe("SupabaseConnector.uploadData", () => {
  it("upserts parents before children and sends JSON columns as objects", async () => {
    const { calls, complete } = await upload([
      { op: PUT, table: "entity_tags", id: "et1", opData: { user_id: "u", entity_id: "p1", entity_kind: "note", tag_id: "t1" } },
      { op: PUT, table: "tags", id: "t1", opData: { user_id: "u", name: "work" } },
      { op: PUT, table: "blocks", id: "b1", opData: { user_id: "u", page_id: "p1", type: "text", content: '{"type":"doc"}' } },
      { op: PUT, table: "pages", id: "p1", opData: { user_id: "u", title: "P", properties: '{"kind":"note"}' } },
    ]);

    expect(calls.map((call) => `${call.kind}:${call.table}`)).toEqual([
      "upsert:pages",
      "upsert:blocks",
      "upsert:tags",
      "upsert:entity_tags",
    ]);

    const records = calls.flatMap((call) => (call.kind === "upsert" ? call.records : []));
    const page = records.find((row) => row.id === "p1");
    const block = records.find((row) => row.id === "b1");
    expect(page?.properties).toEqual({ kind: "note" });
    expect(block?.content).toEqual({ type: "doc" });
    // Every record carries its id, whether or not opData did.
    expect(records.every((row) => typeof row.id === "string")).toBe(true);

    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("deletes children before parents", async () => {
    const { calls, complete } = await upload([
      { op: DELETE, table: "pages", id: "p1" },
      { op: DELETE, table: "blocks", id: "b1" },
    ]);

    expect(calls).toEqual([
      { kind: "delete", table: "blocks", ids: ["b1"] },
      { kind: "delete", table: "pages", ids: ["p1"] },
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("collapses a row's net effect so it is never both upserted and deleted", async () => {
    const deleted = await upload([
      { op: PUT, table: "pages", id: "p1", opData: { title: "P" } },
      { op: DELETE, table: "pages", id: "p1" },
    ]);
    expect(deleted.calls).toEqual([{ kind: "delete", table: "pages", ids: ["p1"] }]);

    const recreated = await upload([
      { op: DELETE, table: "pages", id: "p1" },
      { op: PUT, table: "pages", id: "p1", opData: { title: "P" } },
    ]);
    expect(recreated.calls).toEqual([
      { kind: "upsert", table: "pages", records: [{ title: "P", id: "p1" }] },
    ]);
  });

  it("drops a foreign-key orphan and keeps the rows around it", async () => {
    const { calls, complete } = await upload(
      [
        { op: PUT, table: "blocks", id: "good", opData: { page_id: "p1" } },
        { op: PUT, table: "blocks", id: "orphan", opData: { page_id: "gone" } },
      ],
      (_table, records) =>
        records.length > 1 || records[0].id === "orphan"
          ? { error: { code: "23503", message: "violates foreign key constraint" } }
          : { error: null },
    );

    // One failed bulk request, then one request per row: the good row lands,
    // the orphan is dropped, and the batch completes instead of retrying forever.
    expect(calls).toEqual([
      { kind: "upsert", table: "blocks", records: [{ page_id: "p1", id: "good" }, { page_id: "gone", id: "orphan" }] },
      { kind: "upsert", table: "blocks", records: [{ page_id: "p1", id: "good" }] },
      { kind: "upsert", table: "blocks", records: [{ page_id: "gone", id: "orphan" }] },
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("discards the batch on a permanent error so the queue can drain", async () => {
    const { complete } = await upload(
      [{ op: PUT, table: "pages", id: "p1", opData: { title: "P" } }],
      () => ({ error: { code: "42501", message: "permission denied" } }),
    );

    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("rethrows a retryable error with the server's code and leaves the batch open", async () => {
    const { client } = makeClient(() => ({ error: { code: "08006", message: "connection failure" } }));
    hoisted.client = client;
    const { db, complete } = makeDatabase([{ op: PUT, table: "pages", id: "p1", opData: { title: "P" } }]);

    const connector = new SupabaseConnector();
    await expect(connector.uploadData(db)).rejects.toMatchObject({ code: "08006" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("applies patches individually, after deletes", async () => {
    const { calls } = await upload([
      { op: PATCH, table: "tasks", id: "t1", opData: { title: "Renamed" } },
      { op: DELETE, table: "blocks", id: "b1" },
    ]);

    expect(calls).toEqual([
      { kind: "delete", table: "blocks", ids: ["b1"] },
      { kind: "update", table: "tasks", data: { title: "Renamed", id: "t1" }, id: "t1" },
    ]);
  });
});
