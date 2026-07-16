"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/shared/utils";

import { PageIcon } from "./ui";
import { type NormalizedNotePage } from "./types";

export function NavigationPageLink({
  page,
  selectedPageId,
  onSelectPage,
  showTags = true,
  trailing,
  className,
}: {
  page: NormalizedNotePage;
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  showTags?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  const isSelected = page.id === selectedPageId;

  return (
    <Link
      href={`/notes?page=${page.id}`}
      onClick={() => onSelectPage(page.id)}
      className={`group block overflow-hidden rounded-xl px-1.5 py-2 transition-smooth ${
        isSelected
          ? "text-amber-700 dark:text-amber-300"
          : "text-foreground hover:bg-accent/45"
      } ${className ?? ""}`.trim()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-smooth",
              isSelected
                ? "bg-amber-500/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300"
                : "bg-muted/80 text-muted-foreground group-hover:bg-accent group-hover:text-foreground"
            )}
          >
            <PageIcon
              emoji={page.emoji}
              className="h-3.5 w-3.5 shrink-0 text-sm leading-none"
              fallbackClassName={isSelected ? "text-current" : "text-current"}
            />
          </span>
          <div className="min-w-0">
            <p className={`truncate text-[12px] font-medium ${isSelected ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
              {page.title || "Untitled page"}
            </p>
            {page.summary ? (
              <p className={`mt-0.5 line-clamp-2 text-[10.5px] leading-4.5 ${isSelected ? "text-amber-700/80 dark:text-amber-300/80" : "text-muted-foreground"}`}>
                {page.summary}
              </p>
            ) : null}
          </div>
        </div>
        <div className="pt-0.5 text-muted-foreground transition-smooth group-hover:text-foreground">{trailing ?? null}</div>
      </div>
    </Link>
  );
}
