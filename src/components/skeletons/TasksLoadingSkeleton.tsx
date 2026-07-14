"use client";

import { AppHeader } from "@/components/AppHeader";
import { TasksContentSkeleton, TasksFilterRowSkeleton } from "@/components/tasks/TasksPageSkeleton";
import { getApp } from "@/lib/shared/apps";

const tasksApp = getApp("tasks");

/**
 * Full-page tasks skeleton. Shared by the route `loading.tsx` (navigation
 * fallback) and the cold-start boot skeleton so both look identical.
 */
export function TasksLoadingSkeleton() {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <AppHeader app={tasksApp}>
        <TasksFilterRowSkeleton />
      </AppHeader>
      <TasksContentSkeleton />
    </div>
  );
}
