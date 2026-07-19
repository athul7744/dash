import { ListTodo, Clock, FileText, Quote, type LucideIcon } from "lucide-react";

export interface AppAccent {
  /** Icon background: e.g. "bg-indigo-500/10 dark:bg-indigo-500/20" */
  iconBg: string;
  /** Icon/dot foreground: e.g. "text-indigo-600 dark:text-indigo-400" */
  iconText: string;
}

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
    },
  },
];

export function getApp(id: string): AppConfig {
  return APPS.find((a) => a.id === id) ?? APPS[0];
}