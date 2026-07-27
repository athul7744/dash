"use client";

import { usePathname } from "next/navigation";

import { BookmarksLoadingSkeleton } from "@/components/skeletons/BookmarksLoadingSkeleton";
import { DashboardLoadingSkeleton } from "@/components/skeletons/DashboardLoadingSkeleton";
import { NotesLoadingSkeleton } from "@/components/skeletons/NotesLoadingSkeleton";
import { QuotesLoadingSkeleton } from "@/components/skeletons/QuotesLoadingSkeleton";
import { EventsLoadingSkeleton } from "@/components/skeletons/EventsLoadingSkeleton";
import { EventDetailLoadingSkeleton } from "@/components/skeletons/EventDetailLoadingSkeleton";
import { TasksLoadingSkeleton } from "@/components/skeletons/TasksLoadingSkeleton";
import { TrackerLoadingSkeleton } from "@/components/skeletons/TrackerLoadingSkeleton";

type TrackerView = "week" | "activity" | "mood";

/**
 * Cold-start fallback shown while the local PowerSync DB opens (see
 * PowerSyncProvider). Picks the route-shaped skeleton by pathname — including
 * the tracker/notes view segment — so the boot screen matches the destination
 * with no blank "Loading…" gap and no wrong-then-right skeleton swap.
 */
export function AppBootSkeleton() {
  const path = usePathname();

  if (path.startsWith("/tracker")) {
    // /tracker/<view>; bare /tracker (server-redirected to week) also lands here.
    const seg = path.split("/")[2];
    const view: TrackerView = seg === "activity" || seg === "mood" ? seg : "week";
    return <TrackerLoadingSkeleton view={view} />;
  }
  if (path.startsWith("/tasks")) return <TasksLoadingSkeleton />;
  if (path.startsWith("/quotes")) return <QuotesLoadingSkeleton />;
  if (path.startsWith("/bookmarks")) return <BookmarksLoadingSkeleton />;
  // `/events/<id>` boots the single-subject detail skeleton, bare `/events` the grid.
  if (path.startsWith("/events")) {
    return /^\/events\/.+/.test(path) ? <EventDetailLoadingSkeleton /> : <EventsLoadingSkeleton />;
  }
  if (path.startsWith("/notes")) {
    // `/notes/graph` boots the graph skeleton, `/notes/<id>` the editor, bare
    // `/notes` the overview.
    const mode = path === "/notes/graph" ? "graph" : /^\/notes\/.+/.test(path) ? "editor" : "overview";
    return <NotesLoadingSkeleton mode={mode} />;
  }
  return <DashboardLoadingSkeleton />;
}
