"use client";

import { startOfWeek } from "date-fns";

import { WeeklyJournal } from "@/components/tracker/WeeklyJournal";

/**
 * This week's journal, editable inline. Reuses the tracker's WeeklyJournal
 * (same week key → same underlying system page), which brings its own titled
 * serif surface, lazy page creation, and the note-block editor.
 */
export function DashboardJournal() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  return (
    <section id="weekly-journal" className="scroll-mt-20">
      <WeeklyJournal weekStart={weekStart} />
    </section>
  );
}
