import type { Mood } from "@/lib/tracker/moods";
import type { ActivityCategory } from "@/lib/tracker/activities";
import { ITEM_COLORS, ITEM_COLOR_PALETTE } from "@/lib/shared/item-colors";

/** Shared types for week widgets */
export interface WidgetProps {
  days: Date[];
  /** Map key: "YYYY-MM-DD|HH" → cell data */
  data: Map<string, { id?: string; activityName?: string }>;
  colorMap: Record<string, string>;
  /** Map from activity name → its user-assigned category. */
  categoryMap: Record<string, ActivityCategory>;
  ratings?: Map<string, number>;
  /** The user's configured mood scale (worst→best). */
  moods: Mood[];
}

/** Hex colors for SVG rendering, keyed by activity color name. */
export const COLOR_HEX: Record<string, string> = Object.fromEntries(
  ITEM_COLORS.map((color) => [color, ITEM_COLOR_PALETTE[color].hex]),
);

