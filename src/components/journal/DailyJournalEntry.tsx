"use client";

import { useCallback, useState } from "react";
import { format } from "date-fns";

import { SingleBlockEditor } from "@/components/notes/editor/SingleBlockEditor";
import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { useNotePage } from "@/hooks/use-notes";
import { journalDayKey } from "@/hooks/use-journal";
import { ensureSystemPage } from "@/lib/notes/notes";
import { systemPageId } from "@/lib/notes/system-pages";

/**
 * One day's journal entry, backed by a lazily-created "journal" system page
 * keyed by the date (see {@link journalDayKey}). The page is materialized only
 * on the first keystroke, so browsing empty days persists nothing.
 *
 * Shows the block editor once the day's page exists (or the user opens it);
 * otherwise a quiet serif prompt. The editor text sits flush with its container
 * (the `.journal-surface` rule zeroes the editor's grip-gutter padding).
 */
export function DailyJournalEntry({
  date,
  placeholder = "Write about this day…",
}: {
  date: Date;
  placeholder?: string;
}) {
  const dayKey = journalDayKey(date);
  const userId = useCurrentUserId();
  const [opened, setOpened] = useState(false);

  const pageId = userId ? systemPageId(userId, "journal", dayKey) : null;
  const { page, isLoading } = useNotePage(pageId);

  const ensurePage = useCallback(async () => {
    await ensureSystemPage({
      kind: "journal",
      key: dayKey,
      title: `Journal · ${format(date, "EEE, MMM d, yyyy")}`,
      createStarterBlock: false,
    });
  }, [dayKey, date]);

  const showEditor = page?.id === pageId || opened;

  return (
    <div className="journal-surface">
      {showEditor && pageId ? (
        <SingleBlockEditor
          key={pageId}
          pageId={pageId}
          autoFocus={opened}
          slashScope="dates"
          debounceMs={1000}
          ensurePage={ensurePage}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpened(true)}
          disabled={!userId || isLoading}
          className="w-full rounded-lg py-1.5 text-left font-serif text-base text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
        >
          {placeholder}
        </button>
      )}
    </div>
  );
}
