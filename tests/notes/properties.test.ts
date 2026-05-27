import { describe, expect, it } from "vitest";

import { parseJsonColumns } from "@/lib/powersync/SupabaseConnector";
import { parseCustomPropertyValues } from "@/lib/notes/properties";

// ---------------------------------------------------------------------------
// parseJsonColumns
// ---------------------------------------------------------------------------

describe("parseJsonColumns", () => {
  it("returns empty object for undefined opData", () => {
    expect(parseJsonColumns("pages", undefined)).toEqual({});
  });

  it("parses whitelisted JSON columns for known tables", () => {
    const result = parseJsonColumns("pages", {
      id: "abc",
      title: "My Page",
      properties: '{"favorite":true,"tags":["t1"]}',
    });

    expect(result.properties).toEqual({ favorite: true, tags: ["t1"] });
    expect(result.title).toBe("My Page");
    expect(result.id).toBe("abc");
  });

  it("parses config column for property_definitions", () => {
    const result = parseJsonColumns("property_definitions", {
      name: "Status",
      type: "select",
      config: '{"options":["todo","done"]}',
    });

    expect(result.config).toEqual({ options: ["todo", "done"] });
    expect(result.name).toBe("Status");
  });

  it("does NOT parse non-whitelisted columns even if they look like JSON", () => {
    const result = parseJsonColumns("pages", {
      title: '{"sneaky":"json"}',
      properties: '{"ok":true}',
    });

    expect(result.title).toBe('{"sneaky":"json"}');
    expect(result.properties).toEqual({ ok: true });
  });

  it("does NOT parse any columns for unknown tables", () => {
    const result = parseJsonColumns("unknown_table", {
      data: '{"foo":"bar"}',
      name: "test",
    });

    expect(result.data).toBe('{"foo":"bar"}');
    expect(result.name).toBe("test");
  });

  it("keeps string value if JSON.parse fails", () => {
    const result = parseJsonColumns("pages", {
      properties: "{invalid json",
    });

    expect(result.properties).toBe("{invalid json");
  });

  it("leaves non-string JSON column values untouched", () => {
    const result = parseJsonColumns("pages", {
      properties: { already: "parsed" },
    });

    expect(result.properties).toEqual({ already: "parsed" });
  });

  it("parses tasks.tags column", () => {
    const result = parseJsonColumns("tasks", {
      title: "My Task",
      tags: '["tag1","tag2"]',
    });

    expect(result.tags).toEqual(["tag1", "tag2"]);
    expect(result.title).toBe("My Task");
  });

  it("parses blocks.content column", () => {
    const result = parseJsonColumns("blocks", {
      content: '{"type":"doc","content":[]}',
      page_id: "p1",
    });

    expect(result.content).toEqual({ type: "doc", content: [] });
    expect(result.page_id).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// parseCustomPropertyValues
// ---------------------------------------------------------------------------

describe("parseCustomPropertyValues", () => {
  it("returns empty object when properties has no custom key", () => {
    expect(parseCustomPropertyValues({ favorite: true })).toEqual({});
  });

  it("returns empty object for null properties", () => {
    expect(parseCustomPropertyValues(null as any)).toEqual({});
  });

  it("extracts custom object from properties", () => {
    const result = parseCustomPropertyValues({
      favorite: true,
      custom: { "def-1": "hello", "def-2": 42 },
    });

    expect(result).toEqual({ "def-1": "hello", "def-2": 42 });
  });

  it("handles custom stored as JSON string (legacy double-stringify)", () => {
    const result = parseCustomPropertyValues({
      custom: '{"def-1":"value"}',
    });

    expect(result).toEqual({ "def-1": "value" });
  });

  it("returns empty object if custom is an array", () => {
    expect(parseCustomPropertyValues({ custom: [1, 2, 3] })).toEqual({});
  });

  it("returns empty object if custom is null", () => {
    expect(parseCustomPropertyValues({ custom: null })).toEqual({});
  });

  it("returns empty object if custom string is not valid JSON", () => {
    expect(parseCustomPropertyValues({ custom: "not json" })).toEqual({});
  });
});
