"use client";

import { useMemo } from "react";

import { Tag } from "@/lib/powersync/AppSchema";
import { cn } from "@/lib/shared/utils";
import { getTagColorClasses } from "@/lib/tasks/colors";
import { useAllTags } from "@/hooks/use-tags";

/**
 * Read-only display of a card's selected tags as wrapping pills, resolved from
 * their ids. Mirrors the Bookmarks card layout: an add-tag control lives up in
 * the card's action bar (a `TagSelector` with `showSelectedTags={false}`), and
 * the chosen tags render below via this component.
 */
export function SelectedTagPills({
  tagIds,
  className,
  max,
}: {
  tagIds: string[];
  className?: string;
  /** Show only the first N pills, then a `+N` count — for a compact row. */
  max?: number;
}) {
  const { tags: allTags } = useAllTags();
  const tags = useMemo(
    () => tagIds.map((id) => allTags.find((t) => t.id === id)).filter((t): t is Tag => Boolean(t)),
    [tagIds, allTags],
  );

  if (tags.length === 0) return null;

  const shown = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.length - shown.length;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            "inline-flex h-5 items-center rounded-sm px-1.5 text-[10px] font-medium",
            getTagColorClasses(tag.color || "slate"),
          )}
        >
          {tag.name}
        </span>
      ))}
      {hidden > 0 ? (
        <span className="inline-flex h-5 items-center rounded-sm px-1.5 text-[10px] font-medium text-muted-foreground">
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}
