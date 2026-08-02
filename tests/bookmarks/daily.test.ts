import { describe, expect, it } from "vitest";

import type { Bookmark } from "@/lib/bookmarks/bookmarks";
import { pickDailyBookmark } from "@/lib/bookmarks/daily";

function bookmark(id: string, unread = false): Bookmark {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `b-${id}`,
    note: "",
    favorite: false,
    unread,
    addedAt: "",
    sortRank: id,
  };
}

describe("pickDailyBookmark", () => {
  it("returns null for an empty collection", () => {
    expect(pickDailyBookmark([], new Date(2026, 6, 19))).toBeNull();
  });

  it("returns the only bookmark regardless of date", () => {
    const only = [bookmark("a")];
    expect(pickDailyBookmark(only, new Date(2026, 0, 1))?.id).toBe("a");
    expect(pickDailyBookmark(only, new Date(2026, 6, 19))?.id).toBe("a");
  });

  it("is deterministic for a given local day (stable within the day)", () => {
    const bookmarks = [bookmark("a"), bookmark("b"), bookmark("c"), bookmark("d")];
    const morning = pickDailyBookmark(bookmarks, new Date(2026, 6, 19, 8, 0, 0));
    const evening = pickDailyBookmark(bookmarks, new Date(2026, 6, 19, 23, 30, 0));
    expect(morning?.id).toBe(evening?.id);
  });

  it("advances across days (not frozen on one bookmark)", () => {
    const bookmarks = [bookmark("a"), bookmark("b"), bookmark("c"), bookmark("d"), bookmark("e")];
    const picks = new Set<string>();
    for (let d = 0; d < 30; d++) {
      picks.add(pickDailyBookmark(bookmarks, new Date(2026, 6, 1 + d))!.id);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it("falls back to the full set when nothing is unread", () => {
    const bookmarks = [bookmark("a"), bookmark("b"), bookmark("c")];
    for (let d = 0; d < 60; d++) {
      expect(pickDailyBookmark(bookmarks, new Date(2026, 6, 1 + d))).not.toBeNull();
    }
  });

  it("biases toward unread the majority of days", () => {
    // 1 unread among 5; without bias it would surface ~20% of days.
    const bookmarks = [
      bookmark("new", true),
      bookmark("b"),
      bookmark("c"),
      bookmark("d"),
      bookmark("e"),
    ];
    let unreadDays = 0;
    const DAYS = 200;
    for (let d = 0; d < DAYS; d++) {
      if (pickDailyBookmark(bookmarks, new Date(2026, 0, 1 + d))!.id === "new") unreadDays++;
    }
    // Far above the unbiased 20% baseline, near the 65% bias share.
    expect(unreadDays / DAYS).toBeGreaterThan(0.5);
  });
});
