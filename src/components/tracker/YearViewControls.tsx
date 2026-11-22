"use client";

import { createPortal } from "react-dom";
import { BarChart3, Flag } from "lucide-react";

import { cn } from "@/lib/shared/utils";

interface YearPinsToggleProps {
  pinCount: number;
  pinsOpen: boolean;
  onToggle: () => void;
}

/**
 * The flag that reveals the year's highlights, carrying the count. Its own
 * component because the activity view keeps it inside the insights panel while
 * the mood view keeps it beside the year filter.
 */
export function YearPinsToggle({ pinCount, pinsOpen, onToggle }: YearPinsToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinsOpen}
      aria-label={pinsOpen ? "Hide highlights" : "Show highlights"}
      title={pinsOpen ? "Hide highlights" : "Show highlights"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
        pinsOpen
          ? "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300"
          : "text-muted-foreground ring-border hover:bg-accent hover:text-foreground",
      )}
    >
      <Flag className="h-3.5 w-3.5" aria-hidden />
      {/* A "0" beside a flag reads as a broken counter; the bare flag already says
          the year has none. */}
      {pinCount > 0 ? <span className="tabular-nums">{pinCount}</span> : null}
    </button>
  );
}

interface YearViewControlsProps {
  /** How many highlights the year has — shown so the toggle says something. */
  pinCount: number;
  pinsOpen: boolean;
  onTogglePins: () => void;
  onOpenInsights: () => void;
  /** Hide the floating pair while the insights dialog is up. */
  insightsOpen?: boolean;
  /** The activity view keeps its desktop insights in the side panel, not here. */
  showDesktopInsights?: boolean;
  mounted?: boolean;
  active?: boolean;
}

/**
 * The two year-view extras — pin the highlights, open the year's insights —
 * as one control.
 *
 * Desktop: a pair of pills beside the year filter. Mobile: a single floating
 * group, because two separate floating buttons would fight for the thumb. Both
 * year grids (activity and mood) render this, so the controls can't drift apart
 * between the two views.
 */
export function YearViewControls({
  pinCount,
  pinsOpen,
  onTogglePins,
  onOpenInsights,
  insightsOpen = false,
  showDesktopInsights = true,
  mounted = false,
  active = true,
}: YearViewControlsProps) {
  return (
    <>
      {/* Desktop: beside the year filter, same pill language as Insights. The
          flag carries the count, no label — it sits next to a year, so the shape
          says what it is. */}
      <div className={cn("hidden shrink-0 items-center gap-1.5 lg:flex", !showDesktopInsights && "lg:hidden")}>
        <YearPinsToggle pinCount={pinCount} pinsOpen={pinsOpen} onToggle={onTogglePins} />
        {showDesktopInsights ? (
          <button
            type="button"
            onClick={onOpenInsights}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent hover:text-foreground"
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden />
            Insights
          </button>
        ) : null}
      </div>

      {/* Mobile: one floating group holding both actions. */}
      {mounted && active
        ? createPortal(
            <div
              className={cn(
                "fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card p-1 shadow-lg transition-opacity lg:hidden",
                insightsOpen && "pointer-events-none opacity-0",
              )}
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            >
              <button
                type="button"
                onClick={onTogglePins}
                aria-pressed={pinsOpen}
                aria-label={pinsOpen ? "Hide highlights" : "Show highlights"}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                  pinsOpen ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Flag className="h-4 w-4" aria-hidden />
                {pinCount > 0 ? <span className="tabular-nums">{pinCount}</span> : null}
              </button>
              <span aria-hidden className="h-5 w-px bg-border" />
              <button
                type="button"
                onClick={onOpenInsights}
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <BarChart3 className="h-4 w-4" aria-hidden />
                Insights
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
