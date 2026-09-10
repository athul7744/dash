/// <reference types="vitest/globals" />

import {
  collapseCrudOps,
  isForeignKeyViolation,
  orderTables,
  DELETE_TABLE_ORDER,
  PUT_TABLE_ORDER,
  type CollapsibleOp,
} from "@/lib/powersync/upload-helpers";

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

describe("orderTables", () => {
  it("sends a parent table before the tables that reference it", () => {
    const order = orderTables(["attachments", "blocks", "entity_tags", "pages", "tags"], PUT_TABLE_ORDER);
    expect(order.indexOf("pages")).toBeLessThan(order.indexOf("blocks"));
    expect(order.indexOf("blocks")).toBeLessThan(order.indexOf("attachments"));
    expect(order.indexOf("tags")).toBeLessThan(order.indexOf("entity_tags"));
  });

  it("keeps tags ahead of entity_tags whatever order they arrive in", () => {
    // The batch loses the order the writes were made in, so this list is the only
    // thing standing between a new tag's membership row and `entity_tags_tag_id_fkey`.
    // Left unlisted, `entity_tags` sorted alphabetically ahead of `tags` and every
    // tag an import created was dropped on upload.
    expect(orderTables(["entity_tags", "tags"], PUT_TABLE_ORDER)).toEqual(["tags", "entity_tags"]);
    expect(orderTables(["tags", "entity_tags"], PUT_TABLE_ORDER)).toEqual(["tags", "entity_tags"]);
  });

  it("reverses the order for deletes, so a child goes before its parent", () => {
    const order = orderTables(["pages", "blocks", "attachments", "tags", "entity_tags"], DELETE_TABLE_ORDER);
    expect(order.indexOf("attachments")).toBeLessThan(order.indexOf("blocks"));
    expect(order.indexOf("blocks")).toBeLessThan(order.indexOf("pages"));
    expect(order.indexOf("entity_tags")).toBeLessThan(order.indexOf("tags"));
  });

  it("puts an unlisted table last, alphabetically", () => {
    // A table with no cross-table foreign key can go anywhere; being last means a
    // new one can't jump ahead of a parent by accident.
    expect(orderTables(["time_logs", "pages", "activity_types"], PUT_TABLE_ORDER)).toEqual([
      "pages",
      "activity_types",
      "time_logs",
    ]);
  });
});
