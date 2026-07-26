"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { BookmarksLoadingSkeleton } from "@/components/skeletons/BookmarksLoadingSkeleton";
import { DashboardLoadingSkeleton } from "@/components/skeletons/DashboardLoadingSkeleton";
import { NotesLoadingSkeleton } from "@/components/skeletons/NotesLoadingSkeleton";
import { QuotesLoadingSkeleton } from "@/components/skeletons/QuotesLoadingSkeleton";
import { EventsLoadingSkeleton } from "@/components/skeletons/EventsLoadingSkeleton";
import { TasksLoadingSkeleton } from "@/components/skeletons/TasksLoadingSkeleton";
import { TrackerLoadingSkeleton } from "@/components/skeletons/TrackerLoadingSkeleton";

type TrackerView = "week" | "activity" | "mood";

/** Reads `?view=` so a refresh on Activity/Mood boots into the matching skeleton. */
function TrackerBoot() {
  const view = (useSearchParams().get("view") as TrackerView) || "week";
  return <TrackerLoadingSkeleton view={view} />;
}

/**
 * Cold-start fallback shown while the local PowerSync DB opens (see
 * PowerSyncProvider). Picks the route-shaped skeleton by pathname — and, for
 * tracker, by query param — so the boot screen matches the destination
 * with no blank "Loading…" gap and no wrong-then-right skeleton swap.
 *
 * `useSearchParams` is wrapped in Suspense (Next requirement); its fallback is
 * the param-less default, which is also what each route's own `loading.tsx`
 * shows during navigation.
 */
export function AppBootSkeleton() {
  const path = usePathname();

  if (path.startsWith("/tracker")) {
    return (
      <Suspense fallback={<TrackerLoadingSkeleton />}>
        <TrackerBoot />
      </Suspense>
    );
  }
  if (path.startsWith("/tasks")) return <TasksLoadingSkeleton />;
  if (path.startsWith("/quotes")) return <QuotesLoadingSkeleton />;
  if (path.startsWith("/bookmarks")) return <BookmarksLoadingSkeleton />;
  if (path.startsWith("/events")) return <EventsLoadingSkeleton />;
  if (path.startsWith("/notes")) {
    // `/notes/<id>` boots the editor skeleton; bare `/notes` and `/notes/graph`
    // the overview.
    const mode = /^\/notes\/.+/.test(path) && path !== "/notes/graph" ? "editor" : "overview";
    return <NotesLoadingSkeleton mode={mode} />;
  }
  return <DashboardLoadingSkeleton />;
}
