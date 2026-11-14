"use client";

import {
  ArrowDownAZ,
  CalendarClock,
  Clock,
  Flag,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/shared/utils";
import { TOOL_BUTTON_CLASS } from "@/components/ui/tool-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TASK_SORT_OPTIONS, type TaskSort } from "@/lib/tasks/tasks";

/** Each order gets a glyph, so the trigger can say which one is active without a label. */
const SORT_ICONS: Record<TaskSort, LucideIcon> = {
  due: CalendarClock,
  priority: Flag,
  created: Clock,
  title: ArrowDownAZ,
};

interface TaskSortMenuProps {
  sort: TaskSort;
  onChange: (sort: TaskSort) => void;
  className?: string;
}

/**
 * The list's order control: a pinned icon button that shows the *active* order's
 * glyph, plus its name from `sm` up. One glyph per order means the state reads
 * without opening the menu on a phone, where there is no room for the label.
 */
export function TaskSortMenu({ sort, onChange, className }: TaskSortMenuProps) {
  const activeLabel = TASK_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Due date";
  const ActiveIcon = SORT_ICONS[sort] ?? SORT_ICONS.due;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Sort: ${activeLabel}`}
        title={`Sort: ${activeLabel}`}
        className={cn(
          TOOL_BUTTON_CLASS,
          "text-muted-foreground ring-border hover:bg-accent hover:text-foreground",
          className
        )}
      >
        <ActiveIcon className="h-4 w-4" />
        <span className="hidden whitespace-nowrap sm:inline">{activeLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onChange(value as TaskSort)}>
          {TASK_SORT_OPTIONS.map((option) => {
            const Icon = SORT_ICONS[option.value];
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon className="mr-1.5 h-4 w-4 text-muted-foreground" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
