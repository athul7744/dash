"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { TagColorMark } from "@/components/tags/TagColorMark";
import { placePins } from "@/lib/highlights/pin-layout";
import { cn } from "@/lib/shared/utils";

/** One pin as the grid knows it: what it says, and the point it belongs to. */
export interface YearPin {
  id: string;
  /** The point on the date this pin marks, in the layer's CSS pixels. */
  anchorX: number;
  anchorY: number;
  label: string;
  emoji: string | null;
  /** The highlight's tag colours — the mark's fill. */
  tagColors: string[];
  /** The highlight(s) behind the pin; clicking it opens the first for editing. */
  eventIds?: string[];
  /** Only when the day has more than one: which of them the pin shows. */
  extra?: number;
}

interface Placed {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The highlight pins for a year view: one map-style callout per highlight day,
 * with a leader pointing from the bubble back to its date.
 *
 * Placement is a two-pass affair, both passes before the browser paints: the
 * bubbles render first, then their **measured** size is fed to `placePins`, which
 * returns positions that clear each other. An estimate would either nudge a
 * bubble that fitted (a one-line label is 30px tall, not 44) or let two overlap.
 *
 * The leader is drawn from the anchor to the nearest edge of the bubble, so it is
 * correct whichever way the bubble had to move, and it can never point at a
 * neighbouring date — it starts at the date it belongs to.
 *
 * With `onSelect` the pins become buttons — clicking one opens that highlight's
 * editor — otherwise they stay decorative and pointer-transparent.
 */
export function YearHighlightPins({
  pins,
  onSelect,
  axis = "y",
  className,
}: {
  pins: readonly YearPin[];
  onSelect?: (eventId: string) => void;
  /** Which way a colliding pin may move: vertically, or along the day's row. */
  axis?: "x" | "y";
  className?: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const measure = () => {
      const bounds = layer.getBoundingClientRect();
      const boxes = pins.flatMap((pin) => {
        const el = layer.querySelector<HTMLElement>(`[data-pin-id="${CSS.escape(pin.id)}"]`);
        if (!el) return [];
        const { width, height } = el.getBoundingClientRect();
        return [{
          id: pin.id,
          // Provisional: centred over the anchor and hanging above it, which is
          // where a callout wants to sit before collisions are considered.
          x: pin.anchorX - width / 2,
          y: axis === "y" ? pin.anchorY - height - 6 : pin.anchorY - height,
          w: width,
          h: height,
        }];
      });

      const settled = placePins(boxes, {
        axis,
        direction: axis === "y" ? -1 : 1,
        container: { width: bounds.width, height: bounds.height },
      });
      const next = settled.map((box) => ({ id: box.id, left: box.x, top: box.y, width: box.w, height: box.h }));

      // Sizes don't depend on position, so a re-measure returns the same boxes and
      // this stops: the guard is what keeps the layout pass from looping.
      setPlaced((current) => (samePlaced(current, next) ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    return () => observer.disconnect();
  }, [pins, axis]);

  if (pins.length === 0) return null;

  return (
    <div
      ref={layerRef}
      // Decorative only. Left in the tree once the pins are buttons, so a screen
      // reader can reach them instead of announcing an empty region.
      aria-hidden={onSelect ? undefined : true}
      className={cn("pointer-events-none absolute inset-0 z-20", className)}
    >
      {/* Leaders first, so a bubble always paints over its own line. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {placed.map((pin) => {
          const source = pins.find((candidate) => candidate.id === pin.id);
          if (!source) return null;
          const target = nearestPointOnBox(source.anchorX, source.anchorY, pin);
          if (!target) return null;
          return (
            <g key={pin.id}>
              <line
                x1={source.anchorX}
                y1={source.anchorY}
                x2={target.x}
                y2={target.y}
                strokeWidth={1}
                className="stroke-black/25 dark:stroke-white/35"
              />
              {/* The point itself: a small diamond sitting on the date. */}
              <path
                d="M0,-3.5 L3.5,0 L0,3.5 L-3.5,0 Z"
                transform={`translate(${source.anchorX} ${source.anchorY})`}
                className="fill-white stroke-black/25 dark:fill-neutral-800 dark:stroke-white/35"
                strokeWidth={1}
              />
            </g>
          );
        })}
      </svg>

      {pins.map((pin) => {
        const [primaryId] = pin.eventIds ?? [];
        const position = placed.find((candidate) => candidate.id === pin.id);

        const bubble = (
          <>
            <span className="mt-px shrink-0">
              {pin.emoji ? <SpriteIcon name={pin.emoji} size={15} /> : <TagColorMark colors={pin.tagColors} size={12} />}
            </span>
            {/* Two lines, then clamped: a label cut to one line says almost
                nothing, and the bubble has room to grow downward. */}
            <span className="min-w-0 flex-1 line-clamp-2">{pin.label}</span>
            {pin.extra ? (
              <span className="shrink-0 self-center rounded-sm bg-black/5 px-1 text-[10px] tabular-nums text-neutral-500 dark:bg-white/10 dark:text-neutral-300">
                +{pin.extra}
              </span>
            ) : null}
          </>
        );

        // A dark bubble over the dark grid, a light one over the light grid —
        // either way the surface has to be the opposite of what's behind it.
        // `w-max` matters: an absolutely positioned bubble shrinks to the space
        // left of it, so one anchored near the right edge would wrap early and
        // truncate its label. The width has to come from the label alone.
        const shell =
          "relative flex w-max max-w-[13rem] items-start gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[12px] leading-4 font-medium text-neutral-900 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.55)] dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-50 dark:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.9)]";

        return (
          <div
            key={pin.id}
            data-pin-id={pin.id}
            className="pointer-events-auto absolute"
            style={{
              left: position?.left ?? pin.anchorX,
              // Before the first measurement the bubble is parked off-view
              // rather than flashing where it will not end up.
              top: position?.top ?? pin.anchorY,
              visibility: position ? "visible" : "hidden",
            }}
          >
            {onSelect && primaryId ? (
              <button
                type="button"
                onClick={() => onSelect(primaryId)}
                aria-label={`Edit ${pin.label}`}
                className={cn(shell, "cursor-pointer transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700")}
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

/**
 * The point on the bubble's edge closest to the anchor — the end of the leader.
 *
 * Returns null when the bubble already covers its anchor: the pin is sitting on
 * the date it marks, so a line would have nowhere to go.
 */
function nearestPointOnBox(
  anchorX: number,
  anchorY: number,
  box: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  const nearX = Math.min(Math.max(anchorX, box.left), box.left + box.width);
  const nearY = Math.min(Math.max(anchorY, box.top), box.top + box.height);
  if (nearX === anchorX && nearY === anchorY) return null;
  return { x: nearX, y: nearY };
}

function samePlaced(a: readonly Placed[], b: readonly Placed[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (pin, index) =>
        pin.id === b[index].id &&
        pin.left === b[index].left &&
        pin.top === b[index].top &&
        pin.width === b[index].width &&
        pin.height === b[index].height,
    )
  );
}
