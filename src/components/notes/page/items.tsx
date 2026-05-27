"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Star } from "lucide-react";

import { TagPillStrip } from "@/components/tags/TagPillStrip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

import {
  formatTimestampLabel,
  parseProperties,
} from "./utils";
import { PageIcon } from "./ui";
import { type NormalizedNotePage, NOTE_OVERVIEW_ACCENT_CLASSES } from "./types";

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

export function OverviewPageCard({
  page,
  onSelectPage,
  onToggleFavorite,
  showTags = true,
  showUpdated = false,
}: {
  page: NormalizedNotePage;
  onSelectPage: (pageId: string) => void;
  onToggleFavorite: (page: NormalizedNotePage) => void;
  showTags?: boolean;
  showUpdated?: boolean;
}) {
  const updatedLabel = formatTimestampLabel(page.updated_at)?.relative;
  const pageProperties = parseProperties(page.properties);
  const isFavorite = pageProperties.favorite === true;
  const accentColor = page.tags[0]?.color ?? null;
  const accentClasses = accentColor
    ? NOTE_OVERVIEW_ACCENT_CLASSES[accentColor] ?? NOTE_OVERVIEW_ACCENT_CLASSES.slate
    : null;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/65 bg-card/95 p-3.5 shadow-[0_12px_38px_-28px_rgba(0,0,0,0.45)] transition-smooth hover:-translate-y-0.5 hover:border-border hover:bg-accent/20 sm:p-4",
        accentClasses?.border,
      )}
    >
      <Link
        href={`/notes?page=${page.id}`}
        onClick={() => onSelectPage(page.id)}
        className="absolute inset-0 z-0 rounded-2xl"
        aria-label={`Open ${page.title || "Untitled page"}`}
      />
      {accentClasses ? <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b", accentClasses.glow)} /> : null}
      <div className="relative z-10 flex h-[12.5rem] flex-col gap-2.5 pointer-events-none sm:h-[13.5rem] sm:gap-3">
        <div className="flex items-center justify-between gap-2.5 sm:gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black text-white sm:h-10 sm:w-10">
            <PageIcon emoji={page.emoji} className="h-4 w-4 text-sm leading-none sm:h-4.5 sm:w-4.5 sm:text-base" />
          </span>

          <div className="flex-1" />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onToggleFavorite(page)}
            className={cn(
              "size-7 shrink-0 rounded-full pointer-events-auto sm:size-8",
              isFavorite ? "text-amber-500 hover:text-amber-500" : "text-muted-foreground hover:text-foreground",
            )}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={cn("h-4 w-4", isFavorite ? "fill-current" : null)} />
          </Button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-1.5">
          <p className="line-clamp-2 text-[0.98rem] font-semibold leading-5 text-foreground sm:text-[1.05rem] sm:leading-6">
            {page.title || "Untitled page"}
          </p>

          {page.summary ? (
            <p className="line-clamp-2 text-[12.5px] leading-5 text-muted-foreground sm:text-sm sm:leading-5.5">
              {page.summary}
            </p>
          ) : (
            <p className="line-clamp-2 text-[12.5px] leading-5 text-muted-foreground/70 sm:text-sm sm:leading-5.5">
              Open this page to start writing notes.
            </p>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          {showTags ? <TagPillStrip tags={page.tags} className="max-w-full" /> : null}
          {showUpdated && updatedLabel ? (
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80 sm:text-[11px]">
              Updated {updatedLabel}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
