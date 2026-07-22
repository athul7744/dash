"use client";

import { useMemo, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { ArrowRight, Shuffle } from "lucide-react";

import { Reveal } from "@/components/motion/Reveal";
import { useQuotes } from "@/hooks/use-quotes";
import { pickDailyQuote } from "@/lib/quotes/daily";
import { stripRefs } from "@/lib/links/tokens";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

const QUOTES_APP = getApp("quotes");

/**
 * "Quote of the day" — a deterministic, favorites-weighted daily pick from the
 * quotes collection. "Show another" reveals a different quote transiently
 * (resets on reload). Renders nothing (no reveal wrapper, no gap) when there
 * are no quotes, so it's invisible until the user has some.
 *
 * Two looks:
 * - "card"  (default) — the compact, bordered dashboard tile.
 * - "hero"  — a centered, borderless masthead for the /quotes page.
 */
export function DashboardQuote({
  root,
  showAllLink = true,
  variant = "card",
}: {
  root?: RefObject<HTMLElement | null>;
  showAllLink?: boolean;
  variant?: "card" | "hero";
}) {
  const { quotes, isLoading } = useQuotes();
  const [overrideId, setOverrideId] = useState<string | null>(null);

  const daily = useMemo(() => pickDailyQuote(quotes, new Date()), [quotes]);
  const current = quotes.find((q) => q.id === overrideId) ?? daily;

  if (isLoading || !current) return null;

  const showAnother = () => {
    if (quotes.length < 2) return;
    const others = quotes.filter((q) => q.id !== current.id);
    setOverrideId(others[Math.floor(Math.random() * others.length)].id);
  };

  const eyebrow = (
    <>
      <QUOTES_APP.icon className={cn("h-3.5 w-3.5", QUOTES_APP.accent.iconText)} />
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Quote of the day
      </span>
    </>
  );

  if (variant === "hero") {
    return (
      <Reveal root={root}>
        <section id="quote-of-the-day" className="mx-auto max-w-2xl scroll-mt-20 px-2 py-6 text-center sm:py-12">
          <div className="mb-6 flex items-center justify-center gap-2">{eyebrow}</div>
          <figure>
            <span
              aria-hidden
              className="mb-1 block select-none font-serif text-5xl leading-[0.5] text-rose-400/40 dark:text-rose-500/30 sm:text-6xl"
            >
              &ldquo;
            </span>
            <blockquote className="whitespace-pre-line text-balance font-serif text-xl leading-relaxed text-foreground sm:text-2xl sm:leading-[1.5]">
              {stripRefs(current.text)}
            </blockquote>
            {current.author ? (
              <figcaption className="mt-6 text-sm italic text-muted-foreground">&mdash; {current.author}</figcaption>
            ) : null}
          </figure>
          {quotes.length > 1 ? (
            <button
              type="button"
              onClick={showAnother}
              className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              <Shuffle className="h-3 w-3" />
              Show another
            </button>
          ) : null}
        </section>
      </Reveal>
    );
  }

  return (
    <Reveal root={root} className="mb-14">
      <section id="quote-of-the-day" className="scroll-mt-20">
        <div className="mb-3 flex items-center gap-2">{eyebrow}</div>

        <figure className="rounded-2xl border border-border/65 bg-card/50 p-6 sm:p-8">
          <blockquote className="whitespace-pre-line font-serif text-xl leading-relaxed text-foreground sm:text-2xl">
            {stripRefs(current.text)}
          </blockquote>
          {current.author ? (
            <figcaption className="mt-3 text-sm italic text-muted-foreground">&mdash; {current.author}</figcaption>
          ) : null}
        </figure>

        <div className="mt-3 flex items-center gap-4">
          {quotes.length > 1 ? (
            <button
              type="button"
              onClick={showAnother}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Shuffle className="h-3 w-3" />
              Show another
            </button>
          ) : null}
          {showAllLink ? (
            <Link
              href="/quotes"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All quotes
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </section>
    </Reveal>
  );
}
