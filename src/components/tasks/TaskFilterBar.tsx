"use client";

import { Filter, X } from "lucide-react";

import { cn } from "@/lib/shared/utils";
import { TagSelector } from "@/components/tags/TagSelector";
import { TaskSortMenu } from "@/components/tasks/TaskSortMenu";
import { getTagColorClasses } from "@/lib/tasks/colors";
import type { Tag } from "@/lib/powersync/AppSchema";
import type { TaskSort } from "@/lib/tasks/tasks";

const STATE_PILLS = ["pending", "completed", "trashed"] as const;
const PRIORITY_PILLS = ["low", "medium", "high", "urgent"] as const;
const MAX_TAG_FILTERS = 3;

const STATE_ACTIVE: Record<(typeof STATE_PILLS)[number], string> = {
  pending: "bg-indigo-100 text-indigo-700 dark:bg-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700",
  trashed: "bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-700",
};

const PRIORITY_ACTIVE: Record<(typeof PRIORITY_PILLS)[number], string> = {
  low: "bg-sky-100 text-sky-700 dark:bg-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-700",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-700",
  urgent: "bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200 border border-red-200 dark:border-red-700",
};

const PILL_BASE = "h-8 px-4 font-heading text-sm font-medium rounded-full transition-all capitalize shrink-0 flex items-center gap-1.5";
const PILL_IDLE = "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent";

/** The pinned pair's shell: square and ringed, where the pills are round and flat. */
const TOOL_BUTTON = "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-background px-2 font-heading text-sm font-medium ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3";

interface TaskFilterBarProps {
  filterStates: string[];
  onFilterStatesChange: (next: string[]) => void;
  filterPriorities: string[];
  onFilterPrioritiesChange: (next: string[]) => void;
  filterTags: string[];
  onFilterTagsChange: (next: string[]) => void;
  allTags: Tag[];
  sort: TaskSort;
  onSortChange: (next: TaskSort) => void;
}

/**
 * The tasks list's filter row: scrolling state/priority/tag pills, with the tag
 * filter and the sort menu pinned over the right edge. The pills scroll under a
 * divider and a shadow rather than carrying those two controls out of reach, and
 * the controls are square and ringed so they read as tools, not as more filters.
 */
export function TaskFilterBar({
  filterStates,
  onFilterStatesChange,
  filterPriorities,
  onFilterPrioritiesChange,
  filterTags,
  onFilterTagsChange,
  allTags,
  sort,
  onSortChange,
}: TaskFilterBarProps) {
  const toggleState = (state: string) => {
    onFilterStatesChange(
      filterStates.includes(state) ? filterStates.filter((s) => s !== state) : [...filterStates, state]
    );
  };

  const togglePriority = (priority: string) => {
    onFilterPrioritiesChange(
      filterPriorities.includes(priority)
        ? filterPriorities.filter((p) => p !== priority)
        : [...filterPriorities, priority]
    );
  };

  // Active filters first, so what is narrowing the list is what you see without
  // scrolling. Within a group the order is the group's own.
  const pills = [
    ...STATE_PILLS.map((state) => ({
      id: `state-${state}`,
      label: state as string,
      isActive: filterStates.includes(state),
      activeClass: STATE_ACTIVE[state],
      onClick: () => toggleState(state),
      removable: false,
    })),
    ...PRIORITY_PILLS.map((priority) => ({
      id: `priority-${priority}`,
      label: priority as string,
      isActive: filterPriorities.includes(priority),
      activeClass: PRIORITY_ACTIVE[priority],
      onClick: () => togglePriority(priority),
      removable: false,
    })),
    ...filterTags.flatMap((tagId) => {
      const tag = allTags.find((candidate) => candidate.id === tagId);
      // A tag row can carry a null name; the pill renders blank for it, as before.
      if (!tag) return [];
      return [{
        id: `tag-${tag.id}`,
        label: tag.name ?? "",
        isActive: true,
        activeClass: getTagColorClasses(tag.color || "slate"),
        onClick: () => onFilterTagsChange(filterTags.filter((id) => id !== tag.id)),
        removable: true,
      }];
    }),
  ].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  const tagTriggerTitle = filterTags.length > 0
    ? `${filterTags.length} tag filter${filterTags.length === 1 ? "" : "s"}`
    : "Filter by tag";

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1.5">
        {pills.map((pill) => (
          <button
            key={pill.id}
            onClick={pill.onClick}
            className={cn(PILL_BASE, pill.isActive ? pill.activeClass : PILL_IDLE)}
          >
            {pill.label}
            {pill.removable ? <X className="h-3.5 w-3.5 ml-0.5 opacity-70" /> : null}
          </button>
        ))}
      </div>

      {/* A sibling, not an overlay: when the pair sat on top of the row the last
          pills could be scrolled to the end and still end up underneath it, with
          no further scroll left to bring them out. */}
      <div className="relative flex shrink-0 items-center gap-2 border-l border-border bg-background py-1.5 pl-2 before:pointer-events-none before:absolute before:inset-y-0 before:-left-5 before:w-5 before:bg-gradient-to-l before:from-black/60 before:to-transparent">
        <TagSelector
          selectedTagIds={filterTags}
          onSelectedTagIdsChange={onFilterTagsChange}
          maxSelected={MAX_TAG_FILTERS}
          showSelectedTags={false}
          allowCreate={false}
          align="end"
          triggerProps={{ "aria-label": "Filter by tag", title: tagTriggerTitle }}
          triggerClassName={cn(
            TOOL_BUTTON,
            filterTags.length > 0
              ? "text-primary ring-primary/40 hover:bg-primary/10"
              : "text-muted-foreground ring-border hover:bg-accent hover:text-foreground"
          )}
          triggerContent={
            <>
              <Filter className="h-4 w-4" />
              <span className="hidden whitespace-nowrap sm:inline">Tags</span>
              {filterTags.length > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">
                  {filterTags.length}
                </span>
              ) : null}
            </>
          }
        />

        <TaskSortMenu sort={sort} onChange={onSortChange} />
      </div>
    </div>
  );
}
