"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@powersync/react";
import { ArrowRight, Plus } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

import type { Task } from "@/lib/powersync/AppSchema";
import { db } from "@/lib/powersync/db";
import { getApp } from "@/lib/shared/apps";
import { getCurrentUserId } from "@/lib/shared/auth";
import { debouncedUpdate } from "@/lib/shared/debounced-update";
import { cn } from "@/lib/shared/utils";
import { getDueDateInfo } from "@/lib/tasks/tasks";

type TaskRow = Task & { id: string };

const MAX_VISIBLE = 5;
const TASKS_APP = getApp("tasks");

export function TodayTasks() {
  // Pending, top-level, dated tasks — bucketed in JS via getDueDateInfo so the
  // labels match the Tasks page exactly (local-midnight comparison avoids the
  // ISO/UTC off-by-one a raw SQL date() filter would introduce).
  const { data: dated = [] } = useQuery<TaskRow>(
    `SELECT * FROM tasks
     WHERE state = 'pending' AND parent_id IS NULL
       AND due_date IS NOT NULL AND due_date != ''
     ORDER BY due_date ASC`,
  );

  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");

  const { due, upcomingCount } = useMemo(() => {
    const overdue: TaskRow[] = [];
    const today: TaskRow[] = [];
    let upcoming = 0;
    for (const task of dated) {
      if (completedIds.has(task.id)) continue;
      const label = getDueDateInfo(task.due_date ? new Date(task.due_date) : undefined).label;
      if (label === "Overdue") overdue.push(task);
      else if (label === "Due Today") today.push(task);
      else upcoming += 1;
    }
    return { due: [...overdue, ...today], upcomingCount: upcoming };
  }, [dated, completedIds]);

  const visible = due.slice(0, MAX_VISIBLE);
  const hidden = due.length - visible.length;

  const complete = (id: string) => {
    setCompletedIds((prev) => new Set(prev).add(id));
    debouncedUpdate(id, "state", "completed");
  };

  const addTask = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const value = title.trim();
    if (!value) return;
    setTitle("");
    const userId = await getCurrentUserId();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO tasks (id, user_id, title, priority, link, state, due_date, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [uuidv4(), userId, value, "medium", null, null, "[]", now, now],
    );
  };

  return (
    <section id="today-tasks" className="scroll-mt-20">
      <div className="mb-3 flex items-center gap-2">
        <TASKS_APP.icon className={cn("h-3.5 w-3.5", TASKS_APP.accent.iconText)} />
        <span className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">Today&apos;s tasks</span>
      </div>

      <div className="mb-1 flex items-center gap-2 border-b border-border/50 py-1.5">
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        <input
          id="dashboard-quick-add"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={addTask}
          placeholder="Add a task…"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {due.length === 0 ? (
        <p className="py-3 font-serif text-sm text-muted-foreground">Nothing due today.</p>
      ) : (
        <ul className="animate-stagger">
          {visible.map((task) => {
            const info = getDueDateInfo(task.due_date ? new Date(task.due_date) : undefined);
            return (
              <li key={task.id} className="flex items-center gap-2.5 border-b border-border/50 py-2 last:border-b-0">
                <button
                  type="button"
                  onClick={() => complete(task.id)}
                  aria-label="Mark complete"
                  className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-primary hover:bg-primary/10"
                />
                <Link href="/tasks" className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                  {task.title || "Untitled task"}
                </Link>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px]", info.bg, info.text)}>{info.label}</span>
              </li>
            );
          })}
          {hidden > 0 ? <li className="py-2 text-xs text-muted-foreground">+{hidden} more due</li> : null}
        </ul>
      )}

      {upcomingCount > 0 ? (
        <Link href="/tasks" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <span className="tabular-nums">{upcomingCount}</span> upcoming
          <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </section>
  );
}
