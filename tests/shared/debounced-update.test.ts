/// <reference types="vitest/globals" />

export {};

const debouncedExecuteMock = vi.fn<(...args: any[]) => Promise<any>>(async () => undefined);
const debouncedGetOptionalMock = vi.fn<(...args: any[]) => Promise<any>>(async () => null);

vi.mock("@/lib/powersync/db", () => ({
  db: {
    execute: debouncedExecuteMock,
    getOptional: debouncedGetOptionalMock,
  },
}));

describe("debouncedUpdate comparators", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    debouncedExecuteMock.mockResolvedValue(undefined);
    debouncedGetOptionalMock.mockResolvedValue(null);
  });

  it("skips pages.properties update when JSON is semantically equal", async () => {
    const { debouncedUpdate, flushUpdate } = await import("@/lib/shared/debounced-update");

    debouncedGetOptionalMock.mockResolvedValue({
      properties: JSON.stringify({ summary: "hello", tags: ["a", "b"], favorite: true }),
    });

    debouncedUpdate(
      "page-1",
      "properties",
      JSON.stringify({ favorite: true, tags: ["a", "b"], summary: "hello" }),
      "pages",
      1000
    );

    const result = await flushUpdate("page-1", "pages");

    expect(result).toBeUndefined();
    expect(debouncedExecuteMock).not.toHaveBeenCalled();
  });

  it("writes pages.properties update when semantic JSON value changed", async () => {
    const { debouncedUpdate, flushUpdate } = await import("@/lib/shared/debounced-update");

    debouncedGetOptionalMock.mockResolvedValue({
      properties: JSON.stringify({ summary: "old", tags: ["a", "b"], favorite: true }),
    });

    const nextProperties = JSON.stringify({ favorite: true, tags: ["a", "b"], summary: "new" });

    debouncedUpdate("page-1", "properties", nextProperties, "pages", 1000);

    const result = await flushUpdate("page-1", "pages");

    expect(result).toBe(true);
    expect(debouncedExecuteMock).toHaveBeenCalledTimes(1);

    const sql = String(debouncedExecuteMock.mock.calls[0]?.[0] ?? "");
    const params = (debouncedExecuteMock.mock.calls[0]?.[1] ?? []) as unknown[];
    expect(sql).toContain("UPDATE pages SET");
    expect(sql).toContain("properties = ?");
    expect(sql).toContain("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    expect(params).toEqual([nextProperties, "page-1"]);
  });
});
