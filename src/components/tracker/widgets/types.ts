import type { Mood } from "@/lib/tracker/moods";

/** Shared types for week widgets */
export interface WidgetProps {
  days: Date[];
  /** Map key: "YYYY-MM-DD|HH" → cell data */
  data: Map<string, { id?: string; activityName?: string }>;
  colorMap: Record<string, string>;
  ratings?: Map<string, number>;
  /** The user's configured mood scale (worst→best). */
  moods: Mood[];
}

/** Hex colors for SVG rendering, keyed by activity color name. */
export const COLOR_HEX: Record<string, string> = {
  teal: "#2dd4bf", sky: "#38bdf8", blue: "#3b82f6",
  slate: "#475569", indigo: "#818cf8", emerald: "#34d399",
  pink: "#f472b6", lime: "#a3e635", green: "#4ade80",
  yellow: "#facc15", olive: "#15803d", violet: "#a78bfa",
  purple: "#7c3aed", rose: "#fb7185", fuchsia: "#e879f9",
  cyan: "#22d3ee", orange: "#fb923c", blush: "#fbcfe8",
  amber: "#fbbf24",
};

