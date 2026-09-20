import { CalendarDays, Network, Trash2 } from "lucide-react";

import { type AppConfig } from "@/lib/shared/apps";

/**
 * The cross-app destinations: a day, the graph, the trash.
 *
 * None is an app — none owns a store, and none belongs in the switcher's app
 * list — but each needs the identity an app has, because the same shell renders
 * them: a header, a FAB bar, a tab title and a favicon. They live together here
 * rather than inline in their routes so a route and its loading skeleton wear
 * the same face, and so the set is visible in one place.
 *
 * Each accent has a matching `public/icon-<id>.svg`; keep the two in step.
 */

export const dayApp: AppConfig = {
  id: "day",
  name: "Day",
  description: "Everything one day holds, across every app",
  href: "/day",
  icon: CalendarDays,
  accent: {
    // A deeper green than Tracker's teal: near enough to read as time, far
    // enough not to be mistaken for the tracker itself.
    iconBg: "bg-emerald-600/10 dark:bg-emerald-500/20",
    iconText: "text-emerald-700 dark:text-emerald-400",
    hoverText: "hover:text-emerald-800 dark:hover:text-emerald-300",
  },
};

export const graphApp: AppConfig = {
  id: "graph",
  name: "Graph",
  description: "Every linked item in the vault, as one map",
  href: "/graph",
  icon: Network,
  accent: {
    // Rust: deep enough to sit behind the canvas rather than compete with it,
    // and the only warm dark in the set. Notes' amber is the neighbour to watch
    // — the graph is most often reached from there — so this stays on the brown
    // side of orange, where the amber never goes.
    iconBg: "bg-orange-800/10 dark:bg-orange-700/20",
    iconText: "text-orange-800 dark:text-orange-400",
    hoverText: "hover:text-orange-900 dark:hover:text-orange-300",
  },
};

export const trashApp: AppConfig = {
  id: "trash",
  name: "Trash",
  description: "Restore or permanently delete removed items",
  href: "/trash",
  icon: Trash2,
  accent: {
    iconBg: "bg-slate-500/10 dark:bg-slate-500/20",
    iconText: "text-slate-600 dark:text-slate-400",
    hoverText: "hover:text-slate-700 dark:hover:text-slate-300",
  },
};
