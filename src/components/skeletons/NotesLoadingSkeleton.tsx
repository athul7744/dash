"use client";

import { AppHeader } from "@/components/AppHeader";
import { NotesGraphSkeleton, NotesPageSkeleton } from "@/components/notes/NotesPageSkeleton";
import { getApp } from "@/lib/shared/apps";

const notesApp = getApp("notes");

/**
 * Full-page notes skeleton. Shared by the route `loading.tsx` (navigation
 * fallback) and the cold-start boot skeleton so both look identical.
 *
 * `mode` mirrors the notes page's own surfaces: "overview" (`/notes`),
 * "editor" (`/notes/<id>`), and "graph" (`/notes/graph`, which is chrome-less).
 * The boot skeleton and loading fallback read the URL to pick.
 */
export function NotesLoadingSkeleton({ mode = "overview" }: { mode?: "overview" | "editor" | "graph" }) {
  if (mode === "graph") {
    return (
      <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
        <main className="flex-1 overflow-hidden px-[var(--app-gutter-x)] py-3 sm:py-4 md:py-6">
          <div className="mx-auto h-full min-h-0 max-w-[1600px]">
            <NotesGraphSkeleton />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <AppHeader app={notesApp} />

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-[var(--app-gutter-x)] py-4 pb-[var(--mobile-bottom-fab-clearance)] sm:overflow-hidden sm:pb-4 md:py-8 md:pb-8">
        <div className="mx-auto max-w-[1600px] space-y-6 sm:flex sm:h-full sm:min-h-0 sm:flex-col sm:space-y-0">
          <NotesPageSkeleton mode={mode} />
        </div>
      </main>
    </div>
  );
}
