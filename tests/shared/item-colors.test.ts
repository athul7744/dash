import { describe, expect, it } from "vitest";

import { COLOR_HEX } from "@/components/tracker/widgets/types";
import { ITEM_COLORS, ITEM_COLOR_PALETTE, itemColor } from "@/lib/shared/item-colors";
import { getTagColorClasses, getTagDotClass, TAG_COLORS } from "@/lib/tasks/colors";
import { ACTIVITY_CELL_CLASSES, ACTIVITY_COLORS, getActivityDotClass } from "@/lib/tracker/activities";
import { MOOD_COLORS } from "@/lib/tracker/moods";

describe("assignable item colors", () => {
  it("offers the same complete palette to tags, activities, and moods", () => {
    expect(TAG_COLORS).toEqual(ITEM_COLORS);
    expect(ACTIVITY_COLORS).toEqual(ITEM_COLORS);
    expect(MOOD_COLORS).toEqual(ITEM_COLORS);
    expect(ITEM_COLORS).toHaveLength(23);
    expect(ITEM_COLORS).toEqual(expect.arrayContaining(["olive", "blush", "red", "gray"]));

    for (const color of ITEM_COLORS) {
      expect(getTagColorClasses(color)).toBe(ITEM_COLOR_PALETTE[color].tag);
      expect(getTagDotClass(color)).toBe(getActivityDotClass(color));
      expect(ACTIVITY_CELL_CLASSES[color]).toBe(ITEM_COLOR_PALETTE[color].cell);
      expect(COLOR_HEX[color]).toBe(ITEM_COLOR_PALETTE[color].hex);
      expect(ITEM_COLOR_PALETTE[color].hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("falls back to slate for missing or unknown stored values", () => {
    expect(itemColor(null)).toBe(ITEM_COLOR_PALETTE.slate);
    expect(itemColor("not-a-color")).toBe(ITEM_COLOR_PALETTE.slate);
  });

  it("keeps light labels on opaque dark cells and dark-theme pastels on deeper fills", () => {
    for (const color of ["olive", "purple", "slate", "zinc", "stone", "gray"] as const) {
      expect(itemColor(color).cell).toMatch(/bg-\S+-[67]00(?:\s|$)/);
    }
    for (const color of ["yellow", "green", "cyan"] as const) {
      expect(itemColor(color).cell).toContain(`dark:bg-${color}-700/70`);
    }
  });
});