"use client";

import { useRef, useState } from "react";
import { Search, Settings } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";

import { SettingsDialog } from "@/components/SettingsDialog";
import { SyncIndicator } from "@/components/SyncIndicator";
import { Button } from "@/components/ui/button";
import { AppsFab } from "@/components/dashboard/AppsFab";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { DashboardJournal } from "@/components/dashboard/DashboardJournal";
import { DashboardQuote } from "@/components/dashboard/DashboardQuote";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { TodayTasks } from "@/components/dashboard/TodayTasks";
import { TodayTracking } from "@/components/dashboard/TodayTracking";
import { Reveal } from "@/components/motion/Reveal";
import { useGreeting } from "@/hooks/use-greeting";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { greeting, subline, date } = useGreeting();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll-linked collapse driven by the container's raw scroll offset (px).
  // Tight ranges so the hero snaps into the top bar within a short scroll.
  const { scrollY } = useScroll({ container: scrollRef });

  const heroOpacity = useTransform(scrollY, [0, 120], [1, 0]);
  const heroY = useTransform(scrollY, [0, 180], [0, -32]);
  const heroScale = useTransform(scrollY, [0, 180], [1, 0.97]);
  const heroPointer = useTransform(scrollY, (v) => (v > 120 ? "none" : "auto"));
  const compactOpacity = useTransform(scrollY, [70, 160], [0, 1]);
  const compactY = useTransform(scrollY, [70, 160], [-6, 0]);
  const compactPointer = useTransform(scrollY, (v) => (v > 100 ? "auto" : "none"));

  return (
    <div ref={scrollRef} className="absolute inset-0 snap-y snap-proximity scroll-pt-14 overflow-y-auto bg-background">
      {/* Sticky top bar — direct child so it stays pinned across the whole page */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 bg-background/80 px-[var(--app-gutter-x)] backdrop-blur">
        {/* Left: brand + sync */}
        <div className="flex items-center gap-2">
          <span className="font-heading text-xl font-bold tracking-tight text-foreground">
            Dash<span className="text-primary">.</span>
          </span>
          <SyncIndicator />
        </div>

        {/* Right: message → greeting (settling in) → search → settings */}
        <div className="flex items-center gap-2">
          <motion.div
            style={{ opacity: compactOpacity, y: compactY, pointerEvents: "none" }}
            className="flex max-w-[55vw] items-baseline justify-end gap-2"
          >
            <span className="hidden shrink-0 font-serif text-xs text-muted-foreground sm:inline">{date}</span>
            <span className="truncate font-heading text-sm font-semibold text-foreground">{greeting}</span>
          </motion.div>
          <motion.button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search"
            aria-label="Search tasks and notes"
            style={{ opacity: compactOpacity, pointerEvents: compactPointer }}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </motion.button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            className="rounded-full text-muted-foreground hover:text-foreground"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* The still center — fills the rest of the first screen, collapses on scroll */}
      <motion.div
        style={{ opacity: heroOpacity, y: heroY, scale: heroScale, pointerEvents: heroPointer }}
        className="flex min-h-[calc(100svh-3.5rem)] snap-start items-center justify-center px-[var(--app-gutter-x)] pb-8"
      >
        <DashboardHero greeting={greeting} subline={subline} date={date} onOpenSearch={() => setSearchOpen(true)} />
      </motion.div>

      {/* Reveal — quiet, borderless, fades in as the hero merges to the top bar */}
      <main className="mx-auto max-w-5xl snap-start px-[var(--app-gutter-x)] pt-8 pb-40">
        <DashboardQuote root={scrollRef} />
        <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
          <Reveal root={scrollRef}>
            <TodayTasks />
          </Reveal>
          <Reveal root={scrollRef}>
            <TodayTracking />
          </Reveal>
        </div>
        <Reveal root={scrollRef} className="mt-14">
          <DashboardJournal />
        </Reveal>
      </main>

      {/* Apps — all apps in a bottom pill, one click each */}
      <AppsFab />

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
