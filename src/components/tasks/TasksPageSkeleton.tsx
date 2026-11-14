import { Skeleton, SkeletonWave } from "@/components/ui/skeleton";

/**
 * Mirrors `TaskFilterBar`: scrolling state/priority pills on the left, and the
 * pinned tag-filter + sort controls (square, ringed) behind a divider on the
 * right. Same heights as the real row, so nothing shifts when it lands.
 */
export function TasksFilterRowSkeleton() {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-1.5">
        <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-l border-border py-1.5 pl-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
    </div>
  );
}

function TaskCardSkeleton() {
  return (
    <div className="mb-4 break-inside-avoid rounded-xl border border-border bg-card/70 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Skeleton className="mt-1 h-5 w-5 rounded-md" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TasksContentSkeleton() {
  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden px-[var(--app-gutter-x)] py-4 pb-[var(--mobile-bottom-fab-clearance)] sm:pb-4 md:py-8 md:pb-8">
      <SkeletonWave className="mx-auto max-w-7xl columns-1 gap-6 md:columns-2 xl:columns-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <TaskCardSkeleton key={i} />
        ))}
      </SkeletonWave>
    </main>
  );
}

export function TasksPageSkeleton() {
  return <TasksContentSkeleton />;
}
