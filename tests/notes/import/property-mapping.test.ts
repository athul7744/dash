/// <reference types="vitest/globals" />

/**
 * What the import proposes for each `key:: value`.
 *
 * Counts and value shapes here come from a real vault (Author ×23 with 13 distinct
 * authors, Status ×12 with two values, date ×20 all Logseq-formatted) because the
 * inference rules only earn their keep against that distribution.
 */

import {
  buildPropertyCensus,
  inferPropertyType,
  propertyValueFor,
  type PropertyFileInput,
} from "@/lib/notes/import/property-mapping";

function file(...pairs: Array<[string, string]>): PropertyFileInput {
  return { properties: pairs.map(([key, value]) => ({ key, value })) };
}

/** n files each carrying the same key with the given values. */
function spread(key: string, values: string[]): PropertyFileInput[] {
  return values.map((value) => file([key, value]));
}

describe("buildPropertyCensus", () => {
  it("collapses spellings into one row, keeping the commonest label", () => {
    const census = buildPropertyCensus([file(["Tags", "a"]), file(["Tags", "b"]), file(["tags", "c"])], []);
    expect(census).toHaveLength(1);
    expect(census[0].label).toBe("Tags");
    expect(census[0].variants).toEqual(["Tags", "tags"]);
    expect(census[0].files).toBe(3);
  });

  it("sends a key the app already has a field for to that field", () => {
    const census = buildPropertyCensus([file(["Tags", "life"], ["icon", "💡"], ["title", "X"])], []);
    const actions = Object.fromEntries(census.map((entry) => [entry.label, entry.suggested]));
    expect(actions.Tags).toEqual({ kind: "builtin", field: "tags" });
    expect(actions.icon).toEqual({ kind: "builtin", field: "emoji" });
    expect(actions.title).toEqual({ kind: "builtin", field: "title" });
  });

  it("maps onto an existing definition rather than making a second one", () => {
    const census = buildPropertyCensus(spread("Author", ["a", "b", "c"]), [
      { id: "def-1", name: "author", type: "text" },
    ]);
    expect(census[0].suggested).toEqual({ kind: "existing", definitionId: "def-1", type: "text" });
  });

  it("carries the existing definition's type, not the value's shape", () => {
    // The value has to be stored as what the definition holds: a date read as
    // text lands as an unparseable string the properties panel can't render.
    const census = buildPropertyCensus(spread("date", ["Aug 26th, 2020", "2020-01-01", "Feb 3rd, 2020"]), [
      { id: "def-date", name: "Date", type: "date" },
    ]);
    expect(census[0].suggested).toEqual({ kind: "existing", definitionId: "def-date", type: "date" });
  });

  it("creates a select for a small shared value set, like Status", () => {
    const files = spread("Status", ["#[[Yet To Read]]", "#[[Yet To Read]]", "#Reading"]);
    const census = buildPropertyCensus(files, []);
    expect(census[0].suggested).toEqual({
      kind: "create",
      name: "Status",
      type: "select",
      options: ["Yet To Read", "Reading"],
    });
  });

  it("creates text for a wide-open set, like Author", () => {
    const authors = ["Harari", "Gladwell", "King", "Johnson", "Malhotra", "Savla", "Ries", "Cuban", "Rand"];
    const census = buildPropertyCensus(spread("Author", authors), []);
    expect(census[0].suggested).toMatchObject({ kind: "create", type: "text" });
  });

  it("creates a date property from Logseq's journal dates", () => {
    const census = buildPropertyCensus(spread("date", ["[[Aug 26th, 2020]]", "[[Jul 9th, 2018]]", "[[Feb 3rd, 2020]]"]), []);
    expect(census[0].suggested).toMatchObject({ kind: "create", type: "date" });
  });

  it("ignores a key only one or two files use", () => {
    const census = buildPropertyCensus(spread("oddity", ["x", "y"]), []);
    expect(census[0].suggested).toEqual({ kind: "ignore" });
  });

  it("ignores Logseq's own bookkeeping however often it appears", () => {
    // query-table recurs in a real vault but describes how Logseq drew the page.
    const census = buildPropertyCensus(spread("query-table", ["true", "true", "true"]), []);
    expect(census[0].suggested).toEqual({ kind: "ignore" });
  });

  it("maps banner-align onto the banner's position", () => {
    // It reads like bookkeeping, and was treated as such until the banner had a
    // crop of its own to carry it.
    const census = buildPropertyCensus(spread("banner-align", ["70%", "40%", "10%"]), []);
    expect(census[0].suggested).toEqual({ kind: "builtin", field: "bannerAlign" });
  });

  it("orders by how widely a key is used", () => {
    const census = buildPropertyCensus(
      [...spread("rare", ["a"]), ...spread("common", ["a", "b", "c", "d"])],
      [],
    );
    expect(census.map((entry) => entry.label)).toEqual(["common", "rare"]);
  });
});

describe("inferPropertyType", () => {
  it("reads the obvious shapes", () => {
    expect(inferPropertyType(["2020-01-01", "Aug 26th, 2020"], 3)).toBe("date");
    expect(inferPropertyType(["true", "no"], 3)).toBe("checkbox");
    expect(inferPropertyType(["https://a.com"], 3)).toBe("url");
    expect(inferPropertyType(["1", "2.5", "-3"], 3)).toBe("number");
  });

  it("needs recurrence before committing to a fixed option list", () => {
    expect(inferPropertyType(["Read", "Reading"], 3)).toBe("select");
    expect(inferPropertyType(["Read", "Reading"], 1)).toBe("text");
  });

  it("falls back to text with nothing to go on", () => {
    expect(inferPropertyType([], 5)).toBe("text");
    expect(inferPropertyType([""], 5)).toBe("text");
  });
});

describe("propertyValueFor", () => {
  it("stores each type in its own shape, unwrapping the reference", () => {
    expect(propertyValueFor("date", "[[Aug 26th, 2020]]")).toBe("2020-08-26");
    expect(propertyValueFor("select", "#[[Yet To Read]]")).toBe("Yet To Read");
    expect(propertyValueFor("checkbox", "true")).toBe(true);
    expect(propertyValueFor("checkbox", "no")).toBe(false);
    expect(propertyValueFor("number", "42")).toBe(42);
    expect(propertyValueFor("text", "[[Yuval Noah Harari]]")).toBe("Yuval Noah Harari");
  });

  it("is null when there is nothing usable", () => {
    expect(propertyValueFor("text", "  ")).toBeNull();
    expect(propertyValueFor("date", "Sapiens")).toBeNull();
    expect(propertyValueFor("number", "seven")).toBeNull();
  });
});
