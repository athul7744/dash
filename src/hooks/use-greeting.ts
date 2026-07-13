"use client";

import { useState } from "react";
import { format } from "date-fns";

import { greetingForHour, sublineForIndex } from "@/lib/shared/greeting";

/**
 * The dashboard greeting, computed once per mount so a single random seed drives
 * both the hero and the collapsed top-bar copy (they must read identically).
 * This subtree mounts client-only (PowerSyncProvider gates it), so the lazy
 * seed and `new Date()` reads are SSR-safe.
 */
export function useGreeting() {
  const [seed] = useState(() => Math.floor(Math.random() * 100000));
  const now = new Date();
  return {
    greeting: greetingForHour(now.getHours(), seed),
    subline: sublineForIndex(seed),
    date: format(now, "EEEE, MMMM d"),
  };
}
