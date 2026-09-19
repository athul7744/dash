import { CalendarDays } from "lucide-react";

import { type AppConfig } from "@/lib/shared/apps";

/**
 * A day isn't an app — it's a cross-app destination, like Trash — so it carries
 * its own identity rather than borrowing Tracker's. Kept out of the real app
 * list (nothing should route to it from the switcher) but shared, so the page
 * and its loading skeleton wear the same header.
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
