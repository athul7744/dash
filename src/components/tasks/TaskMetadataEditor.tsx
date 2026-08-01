"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TagSelector } from "@/components/tags/TagSelector";
import { cn } from "@/lib/shared/utils";
import { getDueDateInfo } from "@/lib/tasks/tasks";

interface TaskMetadataEditorProps {
  dueDate: Date | undefined;
  onDueDateChange: (date: Date | undefined) => void;
  selectedTagIds: string[];
  onSelectedTagIdsChange: (tagIds: string[]) => void;
  density?: "compact" | "default";
  dueDateFormat?: string;
  className?: string;
  selectedTagsClassName?: string;
  /** When false, the tag control is omitted (the card renders it elsewhere). */
  showTags?: boolean;
}

const VARIANTS = {
  compact: {
    row: "mt-0.5 pb-0.5",
    dueTrigger: "h-6 px-1.5 -ml-1.5 text-xs",
  },
  default: {
    row: "mt-4",
    dueTrigger: "h-8 px-2 text-xs border border-transparent",
  },
} as const;

export function TaskMetadataEditor({
  dueDate,
  onDueDateChange,
  selectedTagIds,
  onSelectedTagIdsChange,
  density = "compact",
  dueDateFormat = "PPP",
  className,
  showTags = true,
}: TaskMetadataEditorProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const variant = VARIANTS[density];
  const dueDateInfo = getDueDateInfo(dueDate);

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-1.5", variant.row, className)}>
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger
            className={cn(
              "flex items-center justify-start text-left font-normal leading-none hover:bg-accent hover:text-accent-foreground rounded-md transition-colors shrink-0 whitespace-nowrap",
              variant.dueTrigger,
              !dueDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
            {dueDate ? format(dueDate, dueDateFormat) : <span>Pick a date</span>}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dueDate}
              onSelect={(date) => {
                onDueDateChange(date);
                setIsCalendarOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {dueDateInfo.show && (
          <button
            type="button"
            onClick={() => setIsCalendarOpen(true)}
            className={`h-5 inline-flex items-center text-[10px] uppercase tracking-wider font-bold px-1.5 rounded-sm ${dueDateInfo.bg} ${dueDateInfo.text} whitespace-nowrap shrink-0 cursor-pointer transition-opacity hover:opacity-85`}
          >
            {dueDateInfo.label}
          </button>
        )}

        {showTags && (
          <TagSelector
            selectedTagIds={selectedTagIds}
            onSelectedTagIdsChange={onSelectedTagIdsChange}
            density={density}
            triggerLabel="Tag"
          />
        )}
      </div>
    </>
  );
}