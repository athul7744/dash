"use client";

import { useCallback, useState } from "react";
import { format } from "date-fns";

import { SingleBlockEditor } from "@/components/notes/editor/SingleBlockEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { journalDayKey } from "@/hooks/use-journal";
import { ensureSystemPage } from "@/lib/notes/notes";
import { systemPageId } from "@/lib/notes/system-pages";

/** Compact two-line loader sized to a short journal entry, so the editor
 * settling in barely moves the page (unlike the full note block-tree skeleton). */
function JournalEntryLoading() {
  return (
    <div className="space-y-2 py-1.5">
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}

/**
 * One day's journal entry, backed by a lazily-created "journal" system page
 * keyed by the date (see {@link journalDayKey}). The page is materialized only
 * on the first keystroke, so browsing empty days persists nothing.
 *
 * Whether the day already has a page is decided by the caller (`hasEntry`), which
 * reads it from one batched query for the whole week — so navigating weeks/days
 * doesn't trigger a per-entry placeholder→skeleton→content flip. Days with an
 * entry mount the editor straight away (compact skeleton while its blocks load);
 * empty days show a quiet serif prompt until opened.
 */
export function DailyJournalEntry({
  date,
  placeholder = "Write about this day…",
  hasEntry = false,
}: {
  date: Date;
  placeholder?: string;
  hasEntry?: boolean;
}) {
  const dayKey = journalDayKey(date);
  const userId = useCurrentUserId();
  const [opened, setOpened] = useState(false);

  const pageId = userId ? systemPageId(userId, "journal", dayKey) : null;

  const ensurePage = useCallback(async () => {
    await ensureSystemPage({
      kind: "journal",
      key: dayKey,
      title: `Journal · ${format(date, "EEE, MMM d, yyyy")}`,
      createStarterBlock: false,
    });
  }, [dayKey, date]);

  const showEditor = hasEntry || opened;

  return (
    <div className="journal-surface">
      {showEditor && pageId ? (
        // Reserve a few lines' height so the loader→content swap (and switching
        // between entries) doesn't collapse the area and jerk the page.
        <div className="min-h-[4.5rem]">
          <SingleBlockEditor
            key={pageId}
            pageId={pageId}
            autoFocus={opened}
            slashScope="dates"
            debounceMs={1000}
            ensurePage={ensurePage}
            deleteWhenEmpty
            loadingFallback={<JournalEntryLoading />}
            animateEntrance={false}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpened(true)}
          disabled={!userId}
          className="w-full rounded-lg py-1.5 text-left font-serif text-base text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
        >
          {placeholder}
        </button>
      )}
    </div>
  );
}
