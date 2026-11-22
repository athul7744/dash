"use client";

import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { TagColorMark } from "@/components/tags/TagColorMark";
import { cn } from "@/lib/shared/utils";

export interface YearPin {
  id: string;
  /** Anchor position inside the overlay's container, in CSS pixels. */
  x: number;
  y: number;
  label: string;
  emoji: string | null;
  /** The event's tag colours, at most two — the mark splits when there are two. */
  tagColors: string[];
  /** Where the tail sits inside the bubble, so it points at the day even when
   *  the bubble is clamped away from the screen edge. Defaults near the left. */
  tail?: number;
  /**
   * Position the bubble by its **bottom** edge instead of its top, measured up
   * from the layer's bottom. Used where the pin is anchored to a date's row: the
   * bubble can then be any height — one line or two — and still hang the same
   * distance above its date.
   */
  bottom?: number;
  /**
   * How far the bubble was pushed away from its date to clear another pin. The
   * tail grows into a stem of this length, so the arrow still lands on the date
   * instead of on the one the bubble drifted past.
   */
  stem?: number;
  /** The event(s) this pin stands for — clicking it opens the first for editing. */
  eventIds?: string[];
}

/**
 * The highlight pins for a year view: one map-style callout per highlight, floating
 * just above its day with a tail pointing at it.
 *
 * Positions come from `placePins`, so a busy stretch of the year nudges its pins
 * apart instead of stacking them. Its mark wears the event's tag colours, because
 * a highlight has no colour of its own. The bubble takes the
 * theme's opposite surface —
 * white ringed dark in light mode, near-black ringed light in dark — because it
 * has to read over both the near-black gaps of the grid and its saturated tiles.
 *
 * With `onSelect` the pins become buttons — clicking one opens that event's
 * editor — otherwise they stay decorative and pointer-transparent.
 */
export function YearHighlightPins({
  pins,
  onSelect,
  className,
}: {
  pins: readonly YearPin[];
  onSelect?: (eventId: string) => void;
  className?: string;
}) {
  if (pins.length === 0) return null;

  return (
    <div
      // Decorative only. Left in the tree once the pins are buttons, so a screen
      // reader can reach them instead of announcing an empty region.
      aria-hidden={onSelect ? undefined : true}
      className={cn("pointer-events-none absolute inset-0 z-20", className)}
    >
      {pins.map((pin) => {
        const [primaryId] = pin.eventIds ?? [];
        const stem = pin.stem && pin.stem > 4 ? pin.stem : 0;
        const bubble = (
          <>
            <span className="mt-px shrink-0">
              {pin.emoji ? <SpriteIcon name={pin.emoji} size={15} /> : <TagColorMark colors={pin.tagColors} size={12} />}
            </span>
            {/* Two lines, then clamped: a label cut to one line says almost
                nothing, and the bubble has room to grow downward. */}
            <span className="min-w-0 flex-1 line-clamp-2">{pin.label}</span>
            {/* A stem, when the bubble had to move away from its date to clear a
                neighbour: it keeps the point on the day the pin is about. */}
            {stem ? (
              <span
                aria-hidden
                className="absolute top-full w-px bg-black/25 dark:bg-white/35"
                style={{ left: pin.tail ?? 12, height: stem }}
              />
            ) : null}
            {/* The tail: a rotated square sharing the bubble's surface, so the pin
                reads as pointing at its date rather than merely sitting nearby. It
                carries the hover fill too — a tail left on the resting colour
                detaches from the bubble the moment it is pointed at. */}
            <span
              className={cn(
                "absolute h-2 w-2 rotate-45 border-r border-b border-black/10 bg-white transition-colors group-hover:bg-neutral-100 dark:border-white/20 dark:bg-neutral-800 dark:group-hover:bg-neutral-700",
                stem ? "" : "-bottom-[5px]",
              )}
              style={stem ? { left: (pin.tail ?? 12) - 4, top: `calc(100% + ${stem - 4}px)` } : { left: (pin.tail ?? 12) - 4 }}
            />
          </>
        );

        // A dark bubble over the dark grid, a light one over the light grid —
        // either way the surface has to be the opposite of what's behind it.
        const shell =
          "relative flex max-w-[13rem] items-start gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[12px] leading-4 font-medium text-neutral-900 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.55)] dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-50 dark:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.9)]";

        return (
          <div
            key={pin.id}
            className="pointer-events-auto absolute"
            style={pin.bottom === undefined ? { left: pin.x, top: pin.y } : { left: pin.x, bottom: pin.bottom }}
          >
            {onSelect && primaryId ? (
              <button
                type="button"
                onClick={() => onSelect(primaryId)}
                aria-label={`Edit ${pin.label}`}
                className={cn(shell, "group cursor-pointer transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700")}
              >
                {bubble}
              </button>
            ) : (
              <div className={shell}>{bubble}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
