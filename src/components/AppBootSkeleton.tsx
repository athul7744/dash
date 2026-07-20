"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { BookmarksLoadingSkeleton } from "@/components/skeletons/BookmarksLoadingSkeleton";
import { DashboardLoadingSkeleton } from "@/components/skeletons/DashboardLoadingSkeleton";
import { NotesLoadingSkeleton } from "@/components/skeletons/NotesLoadingSkeleton";
import { QuotesLoadingSkeleton } from "@/components/skeletons/QuotesLoadingSkeleton";
import { RemindersLoadingSkeleton } from "@/components/skeletons/RemindersLoadingSkeleton";
import { TasksLoadingSkeleton } from "@/components/skeletons/TasksLoadingSkeleton";
import { TrackerLoadingSkeleton } from "@/components/skeletons/TrackerLoadingSkeleton";

type TrackerView = "week" | "activity" | "mood";

/** Reads `?view=` so a refresh on Activity/Mood boots into the matching skeleton. */
function TrackerBoot() {
  const view = (useSearchParams().get("view") as TrackerView) || "week";
  return <TrackerLoadingSkeleton view={view} />;
}

/** Reads `?page=` so a refresh on an open note boots into the editor skeleton. */
function NotesBoot() {
  const mode = useSearchParams().get("page") ? "editor" : "overview";
  return <NotesLoadingSkeleton mode={mode} />;
}

/**
 * Cold-start fallback shown while the local PowerSync DB opens (see
 * PowerSyncProvider). Picks the route-shaped skeleton by pathname — and, for
 * tracker/notes, by query param — so the boot screen matches the destination
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
  if (path.startsWith("/reminders")) return <RemindersLoadingSkeleton />;
  if (path.startsWith("/notes")) {
    return (
      <Suspense fallback={<NotesLoadingSkeleton />}>
        <NotesBoot />
      </Suspense>
    );
  }
  return <DashboardLoadingSkeleton />;
}
