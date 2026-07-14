"use client";

import { ChevronDown, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { useHeroAction } from "@/hooks/use-hero-action";

import { DashboardGreeting } from "./DashboardGreeting";
import { HeroAction } from "./HeroAction";
import { MoodPicker } from "./MoodPicker";

/**
 * The still center: greeting, one search bar (opens the shared popup), and
 * today's mood. Presentational — greeting text and the open handler come from
 * the page so the hero and collapsed top bar stay in sync.
 */
export function DashboardHero({
  greeting,
  subline,
  date,
  onOpenSearch,
}: {
  greeting: string;
  subline: string;
  date: string;
  onOpenSearch: () => void;
}) {
  const { kind, topTask, ready } = useHeroAction();
  const reduce = useReducedMotion();

  const action =
    kind === "mood" ? <MoodPicker className="justify-center" /> : <HeroAction kind={kind} topTask={topTask} />;

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <DashboardGreeting greeting={greeting} date={date} />
        <p className="font-serif text-sm text-muted-foreground/80 text-balance sm:text-base">{subline}</p>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Search tasks and notes"
        className="flex h-12 w-full max-w-xs items-center gap-3 rounded-full border border-border/70 bg-card/95 px-5 text-left text-sm text-muted-foreground shadow-[0_10px_30px_-24px_rgba(15,23,42,0.6)] transition-colors hover:border-border hover:text-foreground sm:max-w-md lg:max-w-lg"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Search tasks &amp; notes</span>
        <span className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex">⌘K</span>
      </button>

      <div className="flex min-h-11 items-center justify-center">
        {ready ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: "easeOut" }}
          >
            {action}
          </motion.div>
        ) : null}
      </div>

      <ChevronDown className="mt-2 h-5 w-5 text-muted-foreground/40" aria-hidden="true" />
    </div>
  );
}
