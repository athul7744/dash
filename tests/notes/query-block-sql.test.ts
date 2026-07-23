import { describe, it, expect } from "vitest";

import { buildQuerySQL } from "@/components/notes/query-block-sql";
import type { QueryBlockConfig } from "@/lib/notes/query-block";
import type { PropertyDefinitionRow } from "@/hooks/use-property-definitions";

const defs = [{ id: "prop-1" } as PropertyDefinitionRow];
const build = (filters: QueryBlockConfig["filters"]) => buildQuerySQL({ filters, limit: 20 }, defs);

describe("buildQuerySQL filter correctness", () => {
  it("checkbox is_checked matches the JSON boolean 1 (and legacy 'true')", () => {
    expect(build([{ propertyId: "prop-1", operator: "is_checked" }]).sql).toContain("IN (1, 'true')");
  });

  it("checkbox is_unchecked includes NULL and non-truthy values", () => {
    const { sql } = build([{ propertyId: "prop-1", operator: "is_unchecked" }]);
    expect(sql).toContain("IS NULL OR");
    expect(sql).toContain("NOT IN (1, 'true')");
  });

  it("not_equals includes pages that are missing the property", () => {
    const { sql, params } = build([{ propertyId: "prop-1", operator: "not_equals", value: "Done" }]);
    expect(sql).toMatch(/IS NULL OR .* != \?/);
    expect(params).toContain("Done");
  });

  it("not_contains includes pages that are missing the property", () => {
    expect(build([{ propertyId: "prop-1", operator: "not_contains", value: "x" }]).sql).toMatch(
      /IS NULL OR .* NOT LIKE \?/,
    );
  });

  it("skips a filter whose custom property id is unknown (no SQL injection)", () => {
    const { sql, params } = build([{ propertyId: "'; DROP TABLE pages;--", operator: "equals", value: "x" }]);
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).toContain("json_extract(properties, '$.kind') IS NULL");
    expect(params).toEqual([20]);
  });

  it("tags is_none includes untagged pages", () => {
    const { sql } = build([{ propertyId: "__tags__", operator: "is_none", value: ["t1"] }]);
    expect(sql).toContain("$.tags') IS NULL OR");
    expect(sql).toContain("NOT LIKE ?");
  });
});
