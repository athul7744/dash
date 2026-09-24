import { ITEM_COLORS, ITEM_COLOR_PALETTE, itemColor, type ItemColor } from "@/lib/shared/item-colors";

export const ACTIVITY_COLORS = ITEM_COLORS;

export type ActivityColor = ItemColor;

/**
 * User-assignable category per activity. Drives the tracker widgets' semantics
 * (productive/passive split, sleep stats) instead of guessing from the name.
 * `rest` = downtime/leisure; `sleep` is separate so sleep widgets can single it out.
 */
export const ACTIVITY_CATEGORIES = ["productive", "neutral", "rest", "sleep"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export const DEFAULT_ACTIVITY_CATEGORY: ActivityCategory = "neutral";

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  productive: "Productive",
  neutral: "Neutral",
  rest: "Rest",
  sleep: "Sleep",
};

/** Map a category to the Productivity widget's three display buckets. */
export function categoryToProductivityBucket(
  category: ActivityCategory | string | null | undefined
): "productive" | "passive" | "other" {
  if (category === "productive") return "productive";
  if (category === "rest" || category === "sleep") return "passive";
  return "other";
}

/** Default activities seeded when the user has none yet. */
export const DEFAULT_ACTIVITIES: { name: string; color: ActivityColor; category: ActivityCategory }[] = [
  { name: "Coding",    color: "teal",    category: "productive" },
  { name: "Deep Work", color: "indigo",  category: "productive" },
  { name: "Meetings",  color: "orange",  category: "neutral"    },
  { name: "Exercise",  color: "lime",    category: "productive" },
  { name: "Admin",     color: "fuchsia", category: "neutral"    },
];

/**
 * Cell background classes keyed by activity color.
 * Each entry provides light + dark mode bg/text for grid cells.
 */
export const ACTIVITY_CELL_CLASSES: Record<string, string> = Object.fromEntries(
  ITEM_COLORS.map((color) => [color, ITEM_COLOR_PALETTE[color].cell]),
);

/** Dot class for the color picker (matches getTagDotClass pattern). */
export const getActivityDotClass = (color: string): string => itemColor(color).dot;