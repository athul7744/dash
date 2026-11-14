"use client";

import { Filter } from "lucide-react";

import { cn } from "@/lib/shared/utils";
import { TOOL_BUTTON_BASE, TOOL_BUTTON_SIZE } from "@/components/ui/tool-button";
import { TagSelector } from "@/components/tags/TagSelector";
import { useAllTags } from "@/hooks/use-tags";
import { getTagColorClasses } from "@/lib/tasks/colors";

const MAX_TAG_FILTERS = 3;

interface TagFilterButtonProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  /**
   * What the button says while tags are filtering: a count, or the first tag
   * with `+N` for the rest. The second is for toolbars with no room for the
   * selected tags to be listed out.
   */
  summary?: "count" | "tag";
  /** Paint the button in the first selected tag's colour instead of the accent tint. */
  tagColor?: boolean;
  /**
   * `tool` is the square control beside a filter row or a search field; `inline`
   * is a chip that sits inside an existing pill group.
   */
  variant?: "tool" | "inline";
  /** `md` matches a `py-2.5` search field (42px) instead of the 32px toolbar height. */
  size?: "sm" | "md";
  /** Overrides the active tint, for a group with its own accent. */
  activeClassName?: string;
  className?: string;
  maxSelected?: number;
}

/**
 * Filter a collection by tag from one control: `TagSelector` in filter mode (no
 * inline create, capped selections) behind a button whose label carries the
 * current filter.
 */
export function TagFilterButton({
  selectedTagIds,
  onChange,
  summary = "count",
  tagColor = false,
  variant = "tool",
  size = "sm",
  activeClassName,
  className,
  maxSelected = MAX_TAG_FILTERS,
}: TagFilterButtonProps) {
  const { tags: allTags } = useAllTags();
  const selected = selectedTagIds
    .map((id) => allTags.find((tag) => tag.id === id))
    .filter((tag): tag is (typeof allTags)[number] => !!tag);

  const description = selectedTagIds.length > 0
    ? `${selectedTagIds.length} tag filter${selectedTagIds.length === 1 ? "" : "s"}`
    : "Filter by tag";

  const extra = Math.max(0, selected.length - 1);
  const coloured = tagColor && selected.length > 0;
  // A tag-coloured button wears the tag's own border; adding the tool ring on top
  // of it drew two outlines.
  const stateClasses = selected.length === 0
    ? "text-muted-foreground ring-border hover:bg-accent hover:text-foreground"
    : coloured
      ? getTagColorClasses(selected[0].color || "slate")
      : (activeClassName ?? "text-primary ring-primary/40 hover:bg-primary/10");

  return (
    <TagSelector
      selectedTagIds={selectedTagIds}
      onSelectedTagIdsChange={onChange}
      maxSelected={maxSelected}
      showSelectedTags={false}
      allowCreate={false}
      align="end"
      triggerProps={{ "aria-label": description, title: tagsTitle(selected, description) }}
      triggerClassName={cn(
        variant === "tool"
          ? cn(TOOL_BUTTON_BASE, size === "md" ? "h-[42px] px-3" : TOOL_BUTTON_SIZE)
          : size === "md"
            // Inside a rounded search field: a pill as tall as the toolbar pills,
            // so its corners curve concentrically with the capsule around it.
            ? "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors"
            : // The same box as a segmented-control tab: no height of its own, so it
              // fills the control's inner height instead of standing proud of it.
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1 text-xs font-medium transition-colors",
        variant === "tool" && !coloured && "ring-1",
        stateClasses,
        className
      )}
      triggerContent={
        <>
          <Filter className="h-4 w-4 shrink-0" aria-hidden />
          {summary === "tag" && selected.length > 0 ? (
            <>
              {/* Capped so a long tag can't widen the control; the count stays
                  whole while the name ellipsises. */}
              <span className="max-w-[6.5rem] truncate sm:max-w-[10rem]">{selected[0].name ?? "Tag"}</span>
              {extra > 0 ? <span className="shrink-0 text-[11px] opacity-80">+{extra}</span> : null}
            </>
          ) : (
            <>
              <span className="hidden whitespace-nowrap sm:inline">Tags</span>
              {selectedTagIds.length > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">
                  {selectedTagIds.length}
                </span>
              ) : null}
            </>
          )}
        </>
      }
    />
  );
}

/** Hover/tooltip text: the full selection, since the button may truncate it. */
function tagsTitle(selected: Array<{ name: string | null }>, description: string): string {
  const names = selected.map((tag) => tag.name).filter((name): name is string => !!name);
  return names.length > 0 ? names.join(", ") : description;
}
