"use client";

import { useQuery } from "@powersync/react";

import { TaskCard } from "@/components/tasks/TaskCard";
import { BookmarkCard } from "@/components/bookmarks/BookmarkCard";
import { QuoteCard } from "@/components/quotes/QuoteCard";
import { ReminderCard } from "@/components/reminders/ReminderCard";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { parseBookmarkContent, type Bookmark } from "@/lib/bookmarks/bookmarks";
import { parseQuoteContent, type Quote } from "@/lib/quotes/quotes";
import { parseReminderContent, type Reminder } from "@/lib/reminders/reminders";
import type { Task, Tag } from "@/lib/powersync/AppSchema";
import { cn } from "@/lib/shared/utils";

/** Any single item the palette (or a dashboard nudge) can open in a popup. */
export type EntityRef = { kind: "task" | "bookmark" | "quote" | "reminder"; id: string };

type TaskRow = Task & { id: string };
type BlockRow = { id: string; content: string | null; sort_rank: string | null };

const EMPTY_TASK = "SELECT * FROM tasks WHERE 1 = 0";
const EMPTY_BLOCK = "SELECT id, content, sort_rank FROM blocks WHERE 1 = 0";
const EMPTY_TAGS = "SELECT id, name, color FROM tags WHERE 1 = 0";

const TITLE: Record<EntityRef["kind"], string> = {
  task: "Task",
  bookmark: "Bookmark",
  quote: "Quote",
  reminder: "Reminder",
};

const toBookmark = (r: BlockRow): Bookmark => ({ id: r.id, sortRank: r.sort_rank ?? "", ...parseBookmarkContent(r.content) });
const toQuote = (r: BlockRow): Quote => ({ id: r.id, sortRank: r.sort_rank ?? "", ...parseQuoteContent(r.content) });
const toReminder = (r: BlockRow): Reminder => ({ id: r.id, sortRank: r.sort_rank ?? "", ...parseReminderContent(r.content) });

/**
 * Opens one task / bookmark / quote / reminder in a blurred modal, reusing that
 * app's own card (each self-manages its reads/writes via PowerSync). The card is
 * the surface — the dialog shell is transparent and chromeless (no second border,
 * no close button; click-away or Esc closes), so it reads like the app's cards.
 *
 * Everything is looked up live by id (local SQLite → instant), so it stays correct
 * regardless of list pagination/virtualization. Used by the command palette and
 * the dashboard hero nudge.
 */
export function EntityPopup({
  item,
  onOpenChange,
}: {
  item: EntityRef | null;
  onOpenChange: (open: boolean) => void;
}) {
  const isTask = item?.kind === "task";
  const isBlock = item != null && item.kind !== "task";

  const { data: taskRows = [] } = useQuery<TaskRow>(
    isTask ? "SELECT * FROM tasks WHERE id = ?" : EMPTY_TASK,
    isTask ? [item.id] : [],
  );
  const { data: subtasks = [] } = useQuery<TaskRow>(
    isTask ? "SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC" : EMPTY_TASK,
    isTask ? [item.id] : [],
  );
  const { data: blockRows = [] } = useQuery<BlockRow>(
    isBlock ? "SELECT id, content, sort_rank FROM blocks WHERE id = ?" : EMPTY_BLOCK,
    isBlock ? [item.id] : [],
  );
  const { data: allTags = [] } = useQuery<Tag>(item?.kind === "bookmark" ? "SELECT id, name, color FROM tags" : EMPTY_TAGS);

  const taskRow = taskRows[0];
  const blockRow = blockRows[0];
  const ready = isTask ? Boolean(taskRow) : isBlock ? Boolean(blockRow) : false;

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      {item && ready ? (
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-md"
          className="flex w-full flex-col items-end gap-3 border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">{TITLE[item.kind]} details</DialogTitle>
          <DialogDescription className="sr-only">View and edit this {item.kind}.</DialogDescription>
          {/* Solid backing so the cards' bg-card/60 doesn't turn glassy over the
              blurred overlay — same as sitting on the page. Radius matches the card. */}
          <div className={cn("w-full bg-background", item.kind === "task" ? "rounded-xl" : "rounded-2xl")}>
            {item.kind === "task" ? (
              <TaskCard task={taskRow!} subtasks={subtasks} />
            ) : item.kind === "bookmark" ? (
              <BookmarkCard bookmark={toBookmark(blockRow!)} allTags={allTags} />
            ) : item.kind === "quote" ? (
              <QuoteCard quote={toQuote(blockRow!)} />
            ) : (
              <ReminderCard reminder={toReminder(blockRow!)} />
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 shrink-0 rounded-full border border-border/70 bg-background px-4 text-xs font-medium text-muted-foreground shadow-lg transition-colors hover:bg-accent hover:text-foreground"
          >
            Close
          </button>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
