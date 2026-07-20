/// <reference types="vitest/globals" />

import {
  ACTIVITY_CATEGORIES,
  DEFAULT_ACTIVITIES,
  categoryToProductivityBucket,
} from "@/lib/tracker/activities";

describe("categoryToProductivityBucket", () => {
  it("maps productive to the productive bucket", () => {
    expect(categoryToProductivityBucket("productive")).toBe("productive");
  });

  it("maps rest and sleep to the passive bucket", () => {
    expect(categoryToProductivityBucket("rest")).toBe("passive");
    expect(categoryToProductivityBucket("sleep")).toBe("passive");
  });

  it("maps neutral (and unknown/missing) to the other bucket", () => {
    expect(categoryToProductivityBucket("neutral")).toBe("other");
    expect(categoryToProductivityBucket(undefined)).toBe("other");
    expect(categoryToProductivityBucket(null)).toBe("other");
    expect(categoryToProductivityBucket("garbage")).toBe("other");
  });
});

describe("DEFAULT_ACTIVITIES", () => {
  it("seeds every default activity with a valid category", () => {
    for (const a of DEFAULT_ACTIVITIES) {
      expect(ACTIVITY_CATEGORIES).toContain(a.category);
    }
  });
});
