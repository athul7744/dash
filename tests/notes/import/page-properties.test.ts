/// <reference types="vitest/globals" />

/**
 * Getting a value out of a Logseq property.
 *
 * In a real vault almost nothing is a bare string: `Status:: #[[Yet To Read]]`,
 * `Author:: [[Rea Savla]]`, `date:: [[Aug 26th, 2020]]`. The two things that go
 * wrong are forgetting to unwrap the reference, and splitting a list on a comma
 * that lives *inside* one.
 */

import {
  builtinFieldFor,
  cleanPropertyValue,
  parseLogseqDate,
  propertyKeyId,
  splitPropertyList,
} from "@/lib/notes/import/page-properties";

describe("cleanPropertyValue", () => {
  it("unwraps every reference form a real vault uses", () => {
    expect(cleanPropertyValue("#[[Yet To Read]]")).toBe("Yet To Read");
    expect(cleanPropertyValue("#Reading")).toBe("Reading");
    expect(cleanPropertyValue("[[Yuval Noah Harari]]")).toBe("Yuval Noah Harari");
    expect(cleanPropertyValue("  Sapiens  ")).toBe("Sapiens");
  });

  it("leaves an inner bracket pair alone", () => {
    expect(cleanPropertyValue("[[A]] and [[B]]")).toBe("[[A]] and [[B]]");
  });
});

describe("splitPropertyList", () => {
  it("splits a real tags line", () => {
    expect(splitPropertyList("Books To Read, life, meta")).toEqual(["Books To Read", "life", "meta"]);
  });

  it("does not split a comma inside a reference", () => {
    expect(splitPropertyList("[[Feb 3rd, 2020]]")).toEqual(["Feb 3rd, 2020"]);
    expect(splitPropertyList("[[Aug 26th, 2020]], [[Sep 19th, 2020]]")).toEqual(["Aug 26th, 2020", "Sep 19th, 2020"]);
  });

  it("drops empties and unwraps each item", () => {
    expect(splitPropertyList("#[[Yet To Read]], , #Reading")).toEqual(["Yet To Read", "Reading"]);
    expect(splitPropertyList("   ")).toEqual([]);
  });
});

describe("builtinFieldFor", () => {
  it("recognises the keys the app already has a home for", () => {
    expect(builtinFieldFor("tags")).toBe("tags");
    expect(builtinFieldFor("Tags")).toBe("tags");
    expect(builtinFieldFor("icon")).toBe("emoji");
    expect(builtinFieldFor("starred")).toBe("favorite");
    expect(builtinFieldFor("created")).toBe("created");
    expect(builtinFieldFor("banner")).toBe("banner");
  });

  it("leaves `date` to the mapping step", () => {
    // It reads like a timestamp, but in a real vault it's data — a book's
    // reading date. Applying it to created_at would silently rewrite history.
    expect(builtinFieldFor("date")).toBeNull();
    expect(builtinFieldFor("Date")).toBeNull();
  });

  it("treats unknown keys as custom", () => {
    expect(builtinFieldFor("Author")).toBeNull();
    expect(builtinFieldFor("Status")).toBeNull();
  });
});

describe("propertyKeyId", () => {
  it("collapses case and spacing so one key is one row", () => {
    expect(propertyKeyId("Tags")).toBe(propertyKeyId("tags"));
    expect(propertyKeyId("  Author ")).toBe("author");
  });
});

describe("parseLogseqDate", () => {
  it("reads Logseq's journal format, ordinal and all", () => {
    expect(parseLogseqDate("[[Aug 26th, 2020]]")).toBe("2020-08-26");
    expect(parseLogseqDate("[[Jul 9th, 2018]]")).toBe("2018-07-09");
    expect(parseLogseqDate("[[Feb 3rd, 2020]]")).toBe("2020-02-03");
    expect(parseLogseqDate("[[Sep 1st, 2020]]")).toBe("2020-09-01");
  });

  it("reads a plain ISO day without shifting it across a timezone", () => {
    expect(parseLogseqDate("2026-09-07")).toBe("2026-09-07");
    expect(parseLogseqDate("2026-09-07T10:00:00Z")).toBe("2026-09-07");
  });

  it("is null for anything that isn't a date", () => {
    expect(parseLogseqDate("Sapiens")).toBeNull();
    expect(parseLogseqDate("70%")).toBeNull();
    expect(parseLogseqDate("")).toBeNull();
  });
});
