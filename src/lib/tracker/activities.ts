/** Available colors for activity types (subset used by the tracker). */
export const ACTIVITY_COLORS = [
  "teal",
  "sky",
  "blue",
  "slate",
  "indigo",
  "emerald",
  "pink",
  "lime",
  "green",
  "yellow",
  "olive",
  "violet",
  "purple",
  "rose",
  "fuchsia",
  "cyan",
  "orange",
  "blush",
] as const;

export type ActivityColor = (typeof ACTIVITY_COLORS)[number];

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
export const ACTIVITY_CELL_CLASSES: Record<string, string> = {
  teal:    "bg-teal-400/80 dark:bg-teal-600/70 text-teal-950 dark:text-teal-100",
  sky:     "bg-sky-400/80 dark:bg-sky-600/70 text-sky-950 dark:text-sky-100",
  blue:    "bg-blue-500/80 dark:bg-blue-600/70 text-blue-950 dark:text-blue-100",
  slate:   "bg-slate-600/80 dark:bg-slate-700/70 text-slate-100 dark:text-slate-200",
  indigo:  "bg-indigo-400/80 dark:bg-indigo-600/70 text-indigo-950 dark:text-indigo-100",
  emerald: "bg-emerald-500/80 dark:bg-emerald-600/70 text-emerald-950 dark:text-emerald-100",
  pink:    "bg-pink-400/80 dark:bg-pink-500/70 text-pink-950 dark:text-pink-100",
  lime:    "bg-lime-200/80 dark:bg-lime-400/50 text-lime-900 dark:text-lime-100",
  green:   "bg-green-300/80 dark:bg-green-500/70 text-green-950 dark:text-green-100",
  yellow:  "bg-yellow-300/80 dark:bg-yellow-500/70 text-yellow-950 dark:text-yellow-100",
  olive:   "bg-green-700/80 dark:bg-green-800/70 text-green-100 dark:text-green-200",
  violet:  "bg-violet-300/80 dark:bg-violet-500/70 text-violet-950 dark:text-violet-100",
  purple:  "bg-purple-600/80 dark:bg-purple-700/70 text-purple-100 dark:text-purple-200",
  rose:    "bg-rose-400/80 dark:bg-rose-600/70 text-rose-950 dark:text-rose-100",
  fuchsia: "bg-fuchsia-400/80 dark:bg-fuchsia-600/70 text-fuchsia-950 dark:text-fuchsia-100",
  cyan:    "bg-cyan-300/80 dark:bg-cyan-500/70 text-cyan-950 dark:text-cyan-100",
  orange:  "bg-orange-400/80 dark:bg-orange-600/70 text-orange-950 dark:text-orange-100",
  blush:   "bg-pink-200/80 dark:bg-pink-300/50 text-pink-900 dark:text-pink-100",
  amber:   "bg-amber-400/80 dark:bg-amber-600/70 text-amber-950 dark:text-amber-100",
};

/** Toolbar button classes (stronger fill for the selected state). */
export const ACTIVITY_BUTTON_CLASSES: Record<string, { base: string; active: string }> = {
  teal:    { base: "border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300",       active: "bg-teal-500 text-white border-teal-500 dark:bg-teal-600 dark:border-teal-600" },
  sky:     { base: "border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300",             active: "bg-sky-500 text-white border-sky-500 dark:bg-sky-600 dark:border-sky-600" },
  blue:    { base: "border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300",         active: "bg-blue-600 text-white border-blue-600 dark:bg-blue-700 dark:border-blue-700" },
  slate:   { base: "border-slate-400 dark:border-slate-600 text-slate-700 dark:text-slate-300",     active: "bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600" },
  indigo:  { base: "border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300", active: "bg-indigo-500 text-white border-indigo-500 dark:bg-indigo-600 dark:border-indigo-600" },
  emerald: { base: "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300", active: "bg-emerald-500 text-white border-emerald-500 dark:bg-emerald-600 dark:border-emerald-600" },
  pink:    { base: "border-pink-300 dark:border-pink-700 text-pink-700 dark:text-pink-300",         active: "bg-pink-500 text-white border-pink-500 dark:bg-pink-600 dark:border-pink-600" },
  lime:    { base: "border-lime-300 dark:border-lime-700 text-lime-700 dark:text-lime-300",         active: "bg-lime-500 text-white border-lime-500 dark:bg-lime-600 dark:border-lime-600" },
  green:   { base: "border-green-300 dark:border-green-700 text-green-700 dark:text-green-300",     active: "bg-green-500 text-white border-green-500 dark:bg-green-600 dark:border-green-600" },
  yellow:  { base: "border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300", active: "bg-yellow-500 text-white border-yellow-500 dark:bg-yellow-600 dark:border-yellow-600" },
  olive:   { base: "border-green-500 dark:border-green-700 text-green-800 dark:text-green-300",     active: "bg-green-700 text-white border-green-700 dark:bg-green-800 dark:border-green-800" },
  violet:  { base: "border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300", active: "bg-violet-500 text-white border-violet-500 dark:bg-violet-600 dark:border-violet-600" },
  purple:  { base: "border-purple-400 dark:border-purple-700 text-purple-700 dark:text-purple-300", active: "bg-purple-600 text-white border-purple-600 dark:bg-purple-700 dark:border-purple-700" },
  rose:    { base: "border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300",         active: "bg-rose-500 text-white border-rose-500 dark:bg-rose-600 dark:border-rose-600" },
  fuchsia: { base: "border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-700 dark:text-fuchsia-300", active: "bg-fuchsia-500 text-white border-fuchsia-500 dark:bg-fuchsia-600 dark:border-fuchsia-600" },
  cyan:    { base: "border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300",         active: "bg-cyan-500 text-white border-cyan-500 dark:bg-cyan-600 dark:border-cyan-600" },
  orange:  { base: "border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300", active: "bg-orange-500 text-white border-orange-500 dark:bg-orange-600 dark:border-orange-600" },
  blush:   { base: "border-pink-200 dark:border-pink-400 text-pink-600 dark:text-pink-300",         active: "bg-pink-300 text-pink-900 border-pink-300 dark:bg-pink-400 dark:border-pink-400" },
  amber:   { base: "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300",     active: "bg-amber-500 text-white border-amber-500 dark:bg-amber-600 dark:border-amber-600" },
};

/** Dot class for the color picker (matches getTagDotClass pattern). */
export const getActivityDotClass = (color: string): string => {
  const dotMap: Record<string, string> = {
    teal: "bg-teal-500", sky: "bg-sky-500", blue: "bg-blue-600",
    slate: "bg-slate-600", indigo: "bg-indigo-500", emerald: "bg-emerald-500",
    pink: "bg-pink-500", lime: "bg-lime-400", green: "bg-green-400",
    yellow: "bg-yellow-400", olive: "bg-green-700", violet: "bg-violet-400",
    purple: "bg-purple-600", rose: "bg-rose-500", fuchsia: "bg-fuchsia-500",
    cyan: "bg-cyan-400", orange: "bg-orange-500", blush: "bg-pink-300",
    amber: "bg-amber-500",
  };
  return dotMap[color] || "bg-slate-500";
};