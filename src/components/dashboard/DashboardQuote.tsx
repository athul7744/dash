"use client";

import { useMemo, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { ArrowRight, Shuffle } from "lucide-react";

import { Reveal } from "@/components/motion/Reveal";
import { useQuotes } from "@/hooks/use-quotes";
import { pickDailyQuote } from "@/lib/quotes/daily";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

const QUOTES_APP = getApp("quotes");

/**
 * "Quote of the day" — a deterministic, favorites-weighted daily pick from the
 * quotes collection. "Show another" reveals a different quote transiently
 * (resets on reload). Renders nothing (no reveal wrapper, no gap) when there
 * are no quotes, so it's invisible until the user has some.
 */
export function DashboardQuote({
  root,
  showAllLink = true,
}: {
  root?: RefObject<HTMLElement | null>;
  showAllLink?: boolean;
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

  return (
    <Reveal root={root} className="mb-14">
    <section id="quote-of-the-day" className="scroll-mt-20">
      <div className="mb-3 flex items-center gap-2">
        <QUOTES_APP.icon className={cn("h-3.5 w-3.5", QUOTES_APP.accent.iconText)} />
        <span className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">Quote of the day</span>
      </div>

      <figure className="rounded-2xl border border-border/65 bg-card/50 p-6 sm:p-8">
        <blockquote className="whitespace-pre-line font-serif text-xl leading-relaxed text-foreground sm:text-2xl">
          {current.text}
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
