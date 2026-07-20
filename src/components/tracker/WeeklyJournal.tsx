"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { NotebookPen } from "lucide-react";

import { SingleBlockEditor } from "@/components/notes/editor/SingleBlockEditor";
import { useNotePage } from "@/hooks/use-notes";
import { ensureSystemPage } from "@/lib/notes/notes";
import { systemPageId } from "@/lib/notes/system-pages";
import { getCurrentUserId } from "@/lib/shared/auth";

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const left = format(weekStart, "MMM d");
  const right = sameMonth ? format(weekEnd, "d, yyyy") : format(weekEnd, "MMM d, yyyy");
  return `${left} – ${right}`;
}

/**
 * Weekly journal for the tracker's Week view. Each week maps to one lazily
 * created "system page" (see system-pages.ts) reusing the notes block editor.
 * The page is materialized only on the first keystroke (via the editor's
 * `ensurePage`), so opening a week and typing nothing persists nothing — no
 * empty pages to prune, hence no create/delete churn.
 *
 * Stays mounted across weeks (user id fetched once); the inner editor is keyed
 * by page id so it re-hydrates as the week changes.
 */
export function WeeklyJournal({ weekStart }: { weekStart: Date }) {
  const weekKey = format(weekStart, "yyyy-MM-dd");
  const weekLabel = formatWeekLabel(weekStart);

  const [userId, setUserId] = useState<string | null>(null);
  // Whether the user has opened the (possibly empty) editor for this week.
  const [openedKey, setOpenedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getCurrentUserId().then((id) => {
      if (active) setUserId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  const pageId = userId ? systemPageId(userId, "journal", weekKey) : null;
  const { page, isLoading } = useNotePage(pageId);

  const ensurePage = useCallback(async () => {
    await ensureSystemPage({
      kind: "journal",
      key: weekKey,
      title: `Journal · ${weekLabel}`,
      createStarterBlock: false,
    });
  }, [weekKey, weekLabel]);

  // Show the editor once the page exists for THIS week, or once the user opens
  // it for this week. The `page.id === pageId` check guards the query-transition
  // window where `page` can still hold the previous week's row — without it the
  // editor would mount for the new week and lazily create its page on flush.
  const isOpen = openedKey === weekKey;
  const showEditor = page?.id === pageId || isOpen;

  return (
    <div className="journal-surface mx-auto w-full max-w-3xl rounded-2xl border border-border/65 bg-gradient-to-b from-card/70 to-card/40 p-5 shadow-[0_12px_38px_-28px_rgba(0,0,0,0.45)] transition-smooth sm:p-7">
      <div className="mb-4 flex items-baseline gap-2 border-b border-border/60 pb-3">
        <NotebookPen className="h-4 w-4 shrink-0 translate-y-0.5 text-muted-foreground" />
        <span className="font-serif text-lg text-foreground">Journal</span>
        <span className="font-serif text-sm text-muted-foreground">· {weekLabel}</span>
      </div>

      {showEditor && pageId ? (
        <SingleBlockEditor
          key={pageId}
          pageId={pageId}
          autoFocus={isOpen}
          enableSlash={false}
          debounceMs={1000}
          ensurePage={ensurePage}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpenedKey(weekKey)}
          disabled={!userId || isLoading}
          className="w-full rounded-lg px-1 py-6 text-left font-serif text-base text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
        >
          Write about this week…
        </button>
      )}
    </div>
  );
}
