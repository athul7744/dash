"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import { Tag } from "@/lib/powersync/AppSchema";
import { cn } from "@/lib/shared/utils";
import { getTagColorClasses } from "@/lib/tasks/colors";

/**
 * Read-only display of a card's selected tags as wrapping pills, resolved from
 * their ids. Mirrors the Bookmarks card layout: an add-tag control lives up in
 * the card's action bar (a `TagSelector` with `showSelectedTags={false}`), and
 * the chosen tags render below via this component.
 */
export function SelectedTagPills({ tagIds, className }: { tagIds: string[]; className?: string }) {
  const { data: allTags = [] } = useQuery<Tag>("SELECT id, name, color FROM tags");
  const tags = useMemo(
    () => tagIds.map((id) => allTags.find((t) => t.id === id)).filter((t): t is Tag => Boolean(t)),
    [tagIds, allTags],
  );

  if (tags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => (
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
    </div>
  );
}
