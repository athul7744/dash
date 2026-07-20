/// <reference types="vitest/globals" />

import { collapseCrudOps, isForeignKeyViolation, type CollapsibleOp } from "@/lib/powersync/upload-helpers";

const op = (kind: CollapsibleOp["kind"], table: string, id: string, extra: Record<string, unknown> = {}): CollapsibleOp =>
  ({ kind, table, id, data: { id, ...extra } });

describe("collapseCrudOps", () => {
  it("keeps a plain create + child as PUTs", () => {
    const { putOps, deleteOps } = collapseCrudOps([
      op("put", "pages", "A"),
      op("put", "blocks", "b1", { page_id: "A" }),
    ]);
    expect([...putOps.pages.keys()]).toEqual(["A"]);
    expect([...putOps.blocks.keys()]).toEqual(["b1"]);
    expect(deleteOps.pages).toBeUndefined();
  });

  it("collapses create-then-delete of the same id to a delete only (no PUT)", () => {
    const { putOps, deleteOps } = collapseCrudOps([
      op("put", "pages", "A"),
      op("put", "blocks", "b1", { page_id: "A" }),
      op("delete", "blocks", "b1"),
      op("delete", "pages", "A"),
    ]);
    expect(putOps.pages?.has("A")).toBeFalsy();
    expect(putOps.blocks?.has("b1")).toBeFalsy();
    expect([...deleteOps.pages]).toEqual(["A"]);
    expect([...deleteOps.blocks]).toEqual(["b1"]);
  });

  it("collapses delete-then-recreate to a PUT only (the journal churn case)", () => {
    const { putOps, deleteOps } = collapseCrudOps([
      op("delete", "blocks", "b1"),
      op("delete", "pages", "A"),
      op("put", "pages", "A"),
      op("put", "blocks", "b2", { page_id: "A" }),
    ]);
    expect([...putOps.pages.keys()]).toEqual(["A"]);
    expect([...putOps.blocks.keys()]).toEqual(["b2"]);
    // page A must NOT be in deleteOps — else it deletes the row it recreated
    expect(deleteOps.pages?.has("A")).toBeFalsy();
    expect([...deleteOps.blocks]).toEqual(["b1"]);
  });

  it("keeps the latest PUT data when a row is put twice", () => {
    const { putOps } = collapseCrudOps([
      op("put", "pages", "A", { title: "old" }),
      op("put", "pages", "A", { title: "new" }),
    ]);
    expect(putOps.pages.get("A")).toMatchObject({ title: "new" });
  });

  it("drops a patch for a row that ends the batch deleted", () => {
    const { patchOps } = collapseCrudOps([
      op("patch", "blocks", "b1", { content: "x" }),
      op("delete", "blocks", "b1"),
    ]);
    expect(patchOps).toEqual([]);
  });

  it("keeps a patch for a row that survives the batch", () => {
    const { patchOps } = collapseCrudOps([op("patch", "blocks", "b1", { content: "x" })]);
    expect(patchOps).toHaveLength(1);
  });
});

describe("isForeignKeyViolation", () => {
  it("is true for the Postgres FK-violation code (23503), any table", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
  });

  it("is false for other error codes", () => {
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false); // unique violation
    expect(isForeignKeyViolation({ code: "42P01" })).toBe(false);
  });

  it("is false for missing/empty error", () => {
    expect(isForeignKeyViolation(null)).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
    expect(isForeignKeyViolation({})).toBe(false);
  });
});
