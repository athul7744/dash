"use client";

import { useMemo, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Shuffle } from "lucide-react";

import { Favicon } from "@/components/tasks/Favicon";
import { Reveal } from "@/components/motion/Reveal";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { pickDailyBookmark } from "@/lib/bookmarks/daily";
import { getLinkHost } from "@/lib/tasks/tasks";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

const BOOKMARKS_APP = getApp("bookmarks");

/**
 * "Revisit" — a deterministic, unread-biased daily pick from the bookmarks
 * collection. "Show another" reveals a different one transiently (resets on
 * reload). Renders nothing (no reveal wrapper, no gap) when there are no
 * bookmarks, so it's invisible until the user has some.
 *
 * Two looks:
 * - "card"  (default) — the compact, bordered dashboard tile.
 * - "hero"  — a centered, borderless feature for the /bookmarks page.
 */
export function DashboardBookmarks({
  root,
  showAllLink = true,
  variant = "card",
}: {
  root?: RefObject<HTMLElement | null>;
  showAllLink?: boolean;
  variant?: "card" | "hero";
}) {
  const { bookmarks, isLoading } = useBookmarks();
  const [overrideId, setOverrideId] = useState<string | null>(null);

  const daily = useMemo(() => pickDailyBookmark(bookmarks, new Date()), [bookmarks]);
  const current = bookmarks.find((b) => b.id === overrideId) ?? daily;

  if (isLoading || !current) return null;

  const host = getLinkHost(current.url) ?? current.url;

  const showAnother = () => {
    if (bookmarks.length < 2) return;
    const others = bookmarks.filter((b) => b.id !== current.id);
    setOverrideId(others[Math.floor(Math.random() * others.length)].id);
  };

  const eyebrow = (
    <>
      <BOOKMARKS_APP.icon className={cn("h-3.5 w-3.5", BOOKMARKS_APP.accent.iconText)} />
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Revisit</span>
    </>
  );

  const showAnotherButton =
    bookmarks.length > 1 ? (
      <button
        type="button"
        onClick={showAnother}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
          variant === "hero" && "rounded-full border border-border/60 px-3.5 py-1.5 hover:border-border",
        )}
      >
        <Shuffle className="h-3 w-3" />
        Show another
      </button>
    ) : null;

  if (variant === "hero") {
    return (
      <Reveal root={root}>
        <section id="revisit-bookmark" className="mx-auto max-w-2xl scroll-mt-20 px-2 py-4 text-center sm:py-7">
          <div className="mb-4 flex items-center justify-center gap-2">{eyebrow}</div>
          <a href={current.url} target="_blank" rel="noopener noreferrer" className="group block">
            <span className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 dark:bg-sky-500/20">
              <Favicon url={current.url} className="h-4.5 w-4.5" />
            </span>
            <p className="text-balance font-serif text-xl leading-snug text-foreground transition-colors group-hover:text-sky-600 dark:group-hover:text-sky-400 sm:text-2xl">
              {current.title}
            </p>
            <span className="mt-2 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground">
              <span className="truncate">{host}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </span>
          </a>
          {current.note ? (
            <p className="mx-auto mt-3 max-w-md whitespace-pre-line text-sm italic text-muted-foreground/80">
              {current.note}
            </p>
          ) : null}
          {showAnotherButton ? <div className="mt-5">{showAnotherButton}</div> : null}
        </section>
      </Reveal>
    );
  }

  return (
    <Reveal root={root} className="mb-14">
      <section id="revisit-bookmark" className="scroll-mt-20">
        <div className="mb-3 flex items-center gap-2">{eyebrow}</div>

        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-3 rounded-2xl border border-border/65 bg-card/50 p-6 transition-colors hover:border-border sm:p-8"
        >
          <span className="mt-1 shrink-0">
            <Favicon url={current.url} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-medium leading-snug text-foreground group-hover:text-sky-600 dark:group-hover:text-sky-400">
              {current.title}
            </p>
            <span className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground">
              <span className="truncate">{host}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </span>
            {current.note ? (
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground/80">{current.note}</p>
            ) : null}
          </div>
        </a>

        <div className="mt-3 flex items-center gap-4">
          {showAnotherButton}
          {showAllLink ? (
            <Link
              href="/bookmarks"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All bookmarks
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </section>
    </Reveal>
  );
}
