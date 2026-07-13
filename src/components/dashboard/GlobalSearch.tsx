"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@powersync/react";

import { PageIcon } from "@/components/notes/page/ui";
import { useNotesPageDerivedState } from "@/components/notes/page/useNotesPageDerivedState";
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { SearchPopup } from "@/components/ui/search-popup";
import { useAllNotePages } from "@/hooks/use-notes";
import type { Task } from "@/lib/powersync/AppSchema";
import { cn } from "@/lib/shared/utils";
import { getDueDateInfo } from "@/lib/tasks/tasks";

import { TaskPopup } from "./TaskPopup";

type TaskRow = Task & { id: string };
const MAX_RESULTS = 6;

/**
 * Controlled, headless combined search across tasks and notes. Opened from the
 * hero bar, the collapsed top-bar icon, or ⌘K/Ctrl+K — all share this one
 * (centered) popup. Notes deep-link to `/notes?page=`; tasks open in a blurred
 * modal via TaskPopup.
 */
export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  const { data: allTasks = [] } = useQuery<TaskRow>(
    "SELECT * FROM tasks WHERE state != 'trashed' AND parent_id IS NULL ORDER BY updated_at DESC",
  );
  const { pages } = useAllNotePages();
  const { filteredSearchPages } = useNotesPageDerivedState({
    allPages: pages,
    recentPages: pages,
    pageSearchQuery: query,
  });

  const q = query.trim().toLowerCase();
  const tasks = (q ? allTasks.filter((task) => (task.title ?? "").toLowerCase().includes(q)) : allTasks).slice(0, MAX_RESULTS);
  const notes = filteredSearchPages.slice(0, MAX_RESULTS);

  const selectTask = (task: TaskRow) => {
    onOpenChange(false);
    setQuery("");
    setSelectedTask(task);
  };
  const selectNote = (pageId: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(`/notes?page=${pageId}`);
  };

  return (
    <>
      <SearchPopup
        open={open}
        onOpenChange={onOpenChange}
        title="Search"
        description="Search across your tasks and notes."
        placeholder="Search tasks & notes…"
        query={query}
        onQueryChange={setQuery}
      >
        {tasks.length === 0 && notes.length === 0 ? <CommandEmpty>No matches found.</CommandEmpty> : null}

        {tasks.length > 0 ? (
          <CommandGroup heading="Tasks">
            {tasks.map((task) => {
              const info = getDueDateInfo(task.due_date ? new Date(task.due_date) : undefined);
              const showChip = info.show && (info.label === "Overdue" || info.label === "Due Today");
              return (
                <CommandItem
                  key={task.id}
                  value={`task:${task.id}`}
                  onSelect={() => selectTask(task)}
                  className="items-center gap-3 rounded-lg px-3 py-2"
                >
                  <span className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{task.title || "Untitled task"}</span>
                  {showChip ? (
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px]", info.bg, info.text)}>{info.label}</span>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {notes.length > 0 ? (
          <CommandGroup heading="Notes">
            {notes.map((page) => (
              <CommandItem
                key={page.id}
                value={`note:${page.id}`}
                onSelect={() => selectNote(page.id)}
                className="items-start gap-3 rounded-lg px-3 py-2"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <PageIcon emoji={page.emoji} className="h-4 w-4 text-base leading-none" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{page.title || "Untitled page"}</div>
                  {page.summary ? <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{page.summary}</div> : null}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </SearchPopup>

      <TaskPopup task={selectedTask} onOpenChange={(next) => { if (!next) setSelectedTask(null); }} />
    </>
  );
}
