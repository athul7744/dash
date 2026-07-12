"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { NotebookPen } from "lucide-react";

import { NotesBlockTree } from "@/components/notes/NotesBlockTree";
import { useNoteBlockStoreActions } from "@/components/notes/page/useNoteBlockStoreActions";
import { useNoteBlocks, useNotePage } from "@/hooks/use-notes";
import { ensureSystemPage, pruneEmptyJournalPages } from "@/lib/notes/notes";
import { systemPageId } from "@/lib/notes/system-pages";
import { getCurrentUserId } from "@/lib/shared/auth";

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const left = format(weekStart, "MMM d");
  const right = sameMonth ? format(weekEnd, "d, yyyy") : format(weekEnd, "MMM d, yyyy");
  return `${left} – ${right}`;
}

/** Renders the block editor for an existing journal page. */
function JournalEditor({ pageId, autoFocus }: { pageId: string; autoFocus: boolean }) {
  const { blocks } = useNoteBlocks(pageId);
  const actions = useNoteBlockStoreActions({ pageId, selectedBlocks: blocks });
  const autoFocusedRef = useRef(false);

  // On first mount after lazy creation, drop the cursor into the starter block.
  useEffect(() => {
    if (!autoFocus || autoFocusedRef.current) return;
    const block = actions.displayBlocks[0];
    if (block) {
      autoFocusedRef.current = true;
      actions.setFocusTarget({ blockId: block.id, placement: "end" });
    }
  }, [autoFocus, actions]);

  return (
    <NotesBlockTree
      blocks={actions.displayBlocks}
      onCreateFirstBlock={actions.handleCreateRootBlock}
      focusedBlockId={actions.focusTarget?.blockId ?? null}
      focusPlacement={actions.focusTarget?.placement ?? "end"}
      onFocusApplied={() => actions.setFocusTarget(null)}
      onFocusBlock={(blockId, placement) => actions.setFocusTarget({ blockId, placement })}
      notePageTitles={[]}
      onCreateSibling={actions.handleCreateSiblingBlock}
      onCreateEmptySibling={actions.handleCreateEmptySiblingBlock}
      onCreateSiblings={actions.handleCreateSiblingBlocks}
      onMergeWithPrevious={actions.handleMergeWithPreviousBlock}
      onCommitContent={actions.handleCommitBlockContent}
      onIndent={actions.handleIndentBlock}
      onOutdent={actions.handleOutdentBlock}
      onMoveSelectedBlockRange={actions.handleMoveSelectedBlockRange}
      onDelete={actions.handleDeleteBlock}
      onDeleteRange={actions.handleDeleteBlockRange}
      onUpdateContent={actions.handleUpdateBlockContent}
      onEditorRef={(blockId, editor) => actions.store.setEditorRef(blockId, editor)}
      onConvertBlockType={actions.handleConvertBlockType}
    />
  );
}

/**
 * Weekly journal for the tracker's Week view. Each week maps to one lazily
 * created "system page" (see system-pages.ts) reusing the notes block editor.
 * Stays mounted across weeks (user id fetched once); the inner editor is keyed
 * by page id so it re-hydrates as the week changes.
 */
export function WeeklyJournal({ weekStart }: { weekStart: Date }) {
  const weekKey = format(weekStart, "yyyy-MM-dd");
  const weekLabel = formatWeekLabel(weekStart);

  const [userId, setUserId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const creatingRef = useRef(false);
  // Weeks whose page was just created in this session — used to auto-focus once.
  const [createdKey, setCreatedKey] = useState<string | null>(null);

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

  // Opportunistically clean up empty journal pages from other weeks. Runs on
  // mount and whenever the viewed week changes; never deletes the current
  // week's page, so it's safe to run repeatedly (and under StrictMode).
  useEffect(() => {
    if (!pageId) return;
    void pruneEmptyJournalPages(pageId);
  }, [pageId]);

  const handleCreate = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setIsCreating(true);
    try {
      await ensureSystemPage({
        kind: "journal",
        key: weekKey,
        title: `Journal · ${weekLabel}`,
      });
      setCreatedKey(weekKey);
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };

  return (
    <div className="journal-surface mx-auto w-full max-w-3xl rounded-2xl border border-border/65 bg-gradient-to-b from-card/70 to-card/40 p-5 shadow-[0_12px_38px_-28px_rgba(0,0,0,0.45)] transition-smooth sm:p-7">
      <div className="mb-4 flex items-baseline gap-2 border-b border-border/60 pb-3">
        <NotebookPen className="h-4 w-4 shrink-0 translate-y-0.5 text-muted-foreground" />
        <span className="font-serif text-lg text-foreground">Journal</span>
        <span className="font-serif text-sm text-muted-foreground">· {weekLabel}</span>
      </div>

      {page ? (
        <JournalEditor key={pageId} pageId={pageId!} autoFocus={createdKey === weekKey} />
      ) : (
        <button
          type="button"
          onClick={handleCreate}
          disabled={!userId || isLoading || isCreating}
          className="w-full rounded-lg px-1 py-6 text-left font-serif text-base text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
        >
          Write about this week…
        </button>
      )}
    </div>
  );
}
