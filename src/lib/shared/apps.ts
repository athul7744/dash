import { ListTodo, Clock, FileText, Quote, Bookmark, CalendarClock, type LucideIcon } from "lucide-react";

export interface AppAccent {
  /** Icon background: e.g. "bg-indigo-500/10 dark:bg-indigo-500/20" */
  iconBg: string;
  /** Icon/dot foreground: e.g. "text-indigo-600 dark:text-indigo-400" */
  iconText: string;
  /** Hover-only text accent for the app's one primary header button */
  hoverText: string;
}

/**
 * Shared base for every top-bar action button (pill shape, size, spacing).
 * Compose with `app.accent.hoverText` for the single primary action, or
 * `HEADER_ACTION_NEUTRAL` for every secondary one — never a foreign accent.
 */
export const HEADER_ACTION_BASE =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent";
export const HEADER_ACTION_NEUTRAL = `${HEADER_ACTION_BASE} hover:text-foreground`;

export interface AppConfig {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accent: AppAccent;
}

export const APPS: AppConfig[] = [
  {
    id: "tasks",
    name: "Tasks",
    description: "Manage todos with subtasks, tags, and priorities",
    href: "/tasks",
    icon: ListTodo,
    accent: {
      iconBg: "bg-indigo-500/10 dark:bg-indigo-500/20",
      iconText: "text-indigo-600 dark:text-indigo-400",
      hoverText: "hover:text-indigo-600 dark:hover:text-indigo-400",
    },
  },
  {
    id: "tracker",
    name: "Tracker",
    description: "Log time blocks on a 24-hour paint grid",
    href: "/tracker",
    icon: Clock,
    accent: {
      iconBg: "bg-teal-500/10 dark:bg-teal-500/20",
      iconText: "text-teal-600 dark:text-teal-400",
      hoverText: "hover:text-teal-600 dark:hover:text-teal-400",
    },
  },
  {
    id: "notes",
    name: "Notes",
    description: "Capture linked notes in a local-first outliner",
    href: "/notes",
    icon: FileText,
    accent: {
      iconBg: "bg-amber-500/10 dark:bg-amber-500/20",
      iconText: "text-amber-700 dark:text-amber-400",
      hoverText: "hover:text-amber-700 dark:hover:text-amber-400",
    },
  },
  {
    id: "quotes",
    name: "Quotes",
    description: "Collect quotes and resurface one each day",
    href: "/quotes",
    icon: Quote,
    accent: {
      iconBg: "bg-rose-500/10 dark:bg-rose-500/20",
      iconText: "text-rose-600 dark:text-rose-400",
      hoverText: "hover:text-rose-600 dark:hover:text-rose-400",
    },
  },
  {
    id: "bookmarks",
    name: "Bookmarks",
    description: "Save links and resurface one to revisit",
    href: "/bookmarks",
    icon: Bookmark,
    accent: {
      iconBg: "bg-sky-500/10 dark:bg-sky-500/20",
      iconText: "text-sky-600 dark:text-sky-400",
      hoverText: "hover:text-sky-600 dark:hover:text-sky-400",
    },
  },
  {
    id: "events",
    name: "Events",
    description: "Track recurring things: when they happened, how often, and what's due",
    href: "/events",
    icon: CalendarClock,
    accent: {
      iconBg: "bg-violet-500/10 dark:bg-violet-500/20",
      iconText: "text-violet-600 dark:text-violet-400",
      hoverText: "hover:text-violet-600 dark:hover:text-violet-400",
    },
  },
];

export function getApp(id: string): AppConfig {
  return APPS.find((a) => a.id === id) ?? APPS[0];
}