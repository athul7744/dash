"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag } from "@/lib/powersync/AppSchema";
import { cn } from "@/lib/shared/utils";
import { getTagColorClasses, getTagDotClass } from "@/lib/tasks/colors";
import { createTag } from "@/lib/tasks/tags";
import { useAllTags } from "@/hooks/use-tags";

type TagSelectorDensity = "compact" | "default";

const VARIANTS = {
  compact: {
    trigger: "h-6 px-1.5 text-xs",
    popoverWidth: "w-[200px]",
    selectedTags: "mt-0.5",
  },
  default: {
    trigger: "h-8 px-2 text-xs border border-transparent",
    popoverWidth: "w-[220px]",
    selectedTags: "mt-3",
  },
} as const;

type TagSelectorProps = {
  selectedTagIds: string[];
  onSelectedTagIdsChange: (tagIds: string[]) => void;
  density?: TagSelectorDensity;
  triggerLabel?: string;
  triggerClassName?: string;
  popoverWidthClassName?: string;
  selectedTagsClassName?: string;
  showSelectedTags?: boolean;
  maxSelected?: number;
  triggerContent?: ReactNode;
};

export function TagSelector({
  selectedTagIds,
  onSelectedTagIdsChange,
  density = "compact",
  triggerLabel = "Tag",
  triggerClassName,
  popoverWidthClassName,
  selectedTagsClassName,
  showSelectedTags = true,
  maxSelected,
  triggerContent,
}: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { tags: allTags } = useAllTags();

  const variant = VARIANTS[density];
  const hasReachedLimit = maxSelected !== undefined && selectedTagIds.length >= maxSelected;
  const selectedTags = useMemo(
    () => selectedTagIds
      .map((tagId) => allTags.find((tag) => tag.id === tagId) ?? null)
      .filter((tag): tag is Tag => tag !== null),
    [allTags, selectedTagIds]
  );

  const handleCreateInlineTag = async () => {
    const tagName = searchQuery.trim();
    if (!tagName || hasReachedLimit) {
      return;
    }

    const newId = await createTag(tagName, undefined, tagName);
    onSelectedTagIdsChange(selectedTagIds.includes(newId) ? selectedTagIds : [...selectedTagIds, newId]);
    setSearchQuery("");
  };

  const handleToggleTag = (tagId: string) => {
    if (!selectedTagIds.includes(tagId) && hasReachedLimit) {
      return;
    }

    onSelectedTagIdsChange(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId].slice(0, maxSelected ?? Number.POSITIVE_INFINITY)
    );
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        {triggerContent ? (
          <PopoverTrigger
            className={cn(
              "shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              triggerClassName,
            )}
          >
            {triggerContent}
          </PopoverTrigger>
        ) : (
          <PopoverTrigger
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground shrink-0",
              variant.trigger,
              triggerClassName,
            )}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {triggerLabel}
          </PopoverTrigger>
        )}
        <PopoverContent className={cn(variant.popoverWidth, "p-0", popoverWidthClassName)} align="start">
          <Command>
            <CommandInput
              placeholder="Search tags..."
              className="h-9"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {searchQuery.trim() ? (
                  hasReachedLimit ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Tag limit reached.
                    </div>
                  ) : (
                    <div
                      className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={handleCreateInlineTag}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create &quot;{searchQuery}&quot;
                    </div>
                  )
                ) : "No tags found."}
              </CommandEmpty>
              <CommandGroup>
                {allTags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);

                  return (
                    <CommandItem key={tag.id} onSelect={() => handleToggleTag(tag.id)}>
                      <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <div className={cn("mr-2 h-3 w-3 rounded-full", getTagDotClass(tag.color || "slate"))} />
                      <span>{tag.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showSelectedTags && selectedTags.length > 0 ? (
        <div className={cn("flex flex-wrap gap-1.5", variant.selectedTags, selectedTagsClassName)}>
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className={cn("h-5 gap-1 rounded-sm px-1.5 py-0 text-[10px] font-medium shadow-none", getTagColorClasses(tag.color || "slate"))}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </>
  );
}