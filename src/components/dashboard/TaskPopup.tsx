"use client";

import { useQuery } from "@powersync/react";

import { TaskCard } from "@/components/tasks/TaskCard";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Task } from "@/lib/powersync/AppSchema";

type TaskRow = Task & { id: string };

/**
 * Opens a single task in a blurred modal, reusing the full TaskCard (which
 * self-manages its own reads/writes via PowerSync). Used by the dashboard's
 * global search since tasks have no deep-link route.
 */
export function TaskPopup({
  task,
  onOpenChange,
}: {
  task: TaskRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: subtasks = [] } = useQuery<TaskRow>(
    task ? "SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC" : "SELECT * FROM tasks WHERE 1 = 0",
    task ? [task.id] : [],
  );

  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      {task ? (
        <DialogContent
          overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-md"
          className="w-full p-3 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Task details</DialogTitle>
          <DialogDescription className="sr-only">View and edit this task.</DialogDescription>
          <TaskCard task={task} subtasks={subtasks} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
