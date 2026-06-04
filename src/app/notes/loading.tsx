"use client";

import { AppHeader } from "@/components/AppHeader";
import { NotesPageSkeleton } from "@/components/notes/NotesPageSkeleton";
import { getApp } from "@/lib/shared/apps";

const notesApp = getApp("notes");

export default function Loading() {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <AppHeader app={notesApp} />

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-[var(--app-gutter-x)] py-4 pb-[var(--mobile-bottom-fab-clearance)] sm:overflow-hidden sm:pb-4 md:py-8 md:pb-8">
        <div className="mx-auto max-w-[1600px] space-y-6 sm:flex sm:h-full sm:min-h-0 sm:flex-col sm:space-y-0">
          <NotesPageSkeleton />
        </div>
      </main>
    </div>
  );
}