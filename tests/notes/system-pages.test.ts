/// <reference types="vitest/globals" />

import { v5 as uuidv5 } from "uuid";

import { SYSTEM_PAGE_NAMESPACE, systemPageId } from "@/lib/notes/system-pages";

describe("systemPageId", () => {
  it("is deterministic for the same (userId, kind, key)", () => {
    const a = systemPageId("user-1", "journal", "2026-07-06");
    const b = systemPageId("user-1", "journal", "2026-07-06");
    expect(a).toBe(b);
  });

  it("matches an explicit uuidv5 over the documented name scheme", () => {
    expect(systemPageId("user-1", "journal", "2026-07-06")).toBe(
      uuidv5("journal:user-1:2026-07-06", SYSTEM_PAGE_NAMESPACE)
    );
  });

  it("differs by week key", () => {
    expect(systemPageId("user-1", "journal", "2026-07-06")).not.toBe(
      systemPageId("user-1", "journal", "2026-07-13")
    );
  });

  it("differs by user", () => {
    expect(systemPageId("user-1", "journal", "2026-07-06")).not.toBe(
      systemPageId("user-2", "journal", "2026-07-06")
    );
  });

  it("returns a v5 uuid string", () => {
    expect(systemPageId("user-1", "journal", "2026-07-06")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
