import { describe, it, expect } from "vitest";

import { encodeQueryConfig, decodeQueryConfig, QUERY_BLOCK_NODE_TYPE } from "@/lib/notes/query-block-content";

describe("query-block-content codec", () => {
  it("encodes config into a queryBlock note document", () => {
    const doc = encodeQueryConfig({
      filters: [{ propertyId: "__title__", operator: "contains", value: "x" }],
      columns: ["__created_at__"],
      limit: 5,
    });

    expect(doc.type).toBe("doc");
    expect(doc.content[0].type).toBe(QUERY_BLOCK_NODE_TYPE);
    expect(doc.content[0].attrs.filters).toHaveLength(1);
    expect(doc.content[0].attrs.limit).toBe(5);
  });

  it("round-trips a config through encode → decode", () => {
    const config = {
      filters: [{ propertyId: "__title__", operator: "contains" as const, value: "x" }],
      columns: ["__created_at__"],
      sort: { propertyId: "__title__", direction: "asc" as const },
      limit: 7,
    };

    expect(decodeQueryConfig(encodeQueryConfig(config))).toEqual(config);
  });

  it("decodes a serialized JSON string of the doc form", () => {
    const json = JSON.stringify(encodeQueryConfig({ filters: [], columns: [], limit: 20 }));

    expect(decodeQueryConfig(json)).toEqual({ filters: [], columns: [], sort: undefined, limit: 20 });
  });

  it("decodes legacy raw-config content for backward compatibility", () => {
    const legacy = JSON.stringify({
      filters: [{ propertyId: "__title__", operator: "contains" }],
      columns: ["a"],
      limit: 10,
    });

    expect(decodeQueryConfig(legacy)).toEqual({
      filters: [{ propertyId: "__title__", operator: "contains" }],
      columns: ["a"],
      sort: undefined,
      limit: 10,
    });
  });

  it("returns sensible defaults for empty/invalid content", () => {
    expect(decodeQueryConfig(null)).toEqual({ filters: [], columns: [], sort: undefined, limit: 20 });
    expect(decodeQueryConfig("not json")).toEqual({ filters: [], columns: [], sort: undefined, limit: 20 });
    expect(decodeQueryConfig({ type: "doc", content: [{ type: "paragraph" }] })).toEqual({
      filters: [],
      columns: [],
      sort: undefined,
      limit: 20,
    });
  });
});
