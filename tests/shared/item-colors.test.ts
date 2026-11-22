import { describe, expect, it } from "vitest";

import { COLOR_HEX } from "@/components/tracker/widgets/types";
import { ITEM_COLORS, ITEM_COLOR_PALETTE, itemColor } from "@/lib/shared/item-colors";
import { getTagColorClasses, getTagDotClass, tagColors, TAG_COLORS } from "@/lib/tasks/colors";
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

  it("lists the tag colours a mark can draw, skipping ones that are gone or colourless", () => {
    const tags = [
      { id: "t1", color: null },
      { id: "t2", color: "rose" },
      { id: "t3", color: "sky" },
    ];
    // In tag order, so the mark matches the pills next to it.
    expect(tagColors(["missing", "t1", "t2", "t3"], tags)).toEqual(["rose", "sky"]);
    expect(tagColors(["t3", "t2"], tags)).toEqual(["sky", "rose"]);
    expect(tagColors([], tags)).toEqual([]);
    expect(tagColors(["missing"], tags)).toEqual([]);
    // Never more than the mark can show, however many tags the entity carries.
    expect(tagColors(["t2", "t3"], tags, 1)).toEqual(["rose"]);
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