"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { TagColorMark } from "@/components/tags/TagColorMark";
import { placePins, type PinBox } from "@/lib/highlights/pin-layout";
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
  /**
   * Which band this pin competes for space in — a month card. Pins in the same
   * group are laid out in date order across that band's lanes, so reading them
   * left-to-right, top-to-bottom follows the calendar.
   */
  group?: string;
  /**
   * The band a group lays out in, in the layer's pixels: the card's own width,
   * and the line below its header that a pin may not start above.
   */
  laneArea?: { left: number; width: number; top?: number; bottom?: number };
}

/** Narrowest a lane may be before the card takes one column instead of two. */
const MIN_LANE_WIDTH = 96;
/**
 * Above this many pins a month splits into two lanes.
 *
 * Two lanes halve the bubbles' width, which costs label text — worth it when the
 * alternative is a pin hundreds of pixels above its own dates, not worth it for a
 * month that a single column already holds.
 */
const LANES_FROM_COUNT = 4;
const LANE_GAP = 6;
/** Space a pin keeps below the one above it in its lane. */
const PIN_GAP = 4;

interface Placed {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** True when the lane decides the width, so the label wraps inside it. */
  constrained?: boolean;
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
  onLayout,
  axis = "y",
  className,
}: {
  pins: readonly YearPin[];
  onSelect?: (eventId: string) => void;
  /**
   * Called with the extra height each group's stack needs beyond the room it has
   * — keyed by `group`, in pixels. The mood grid grows the month card by it, so a
   * tall stack never lands on the next month's header.
   */
  onLayout?: (spacers: Record<string, number>) => void;
  /** Which way a colliding pin may move: vertically, or along the day's row. */
  axis?: "x" | "y";
  className?: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  // Lines are addressed straight from their bubble's pointer events: pointing at
  // one of two dozen pins must not re-render the other twenty-three.
  const connectors = useRef(new Map<string, { line: SVGLineElement | null; dot: SVGPathElement | null }>());

  /**
   * Thicken one pin's leader and its point while the bubble is pointed at.
   *
   * Written straight onto the SVG nodes: the two dozen other pins shouldn't
   * re-render because the pointer moved, and this is the one place where a
   * hover has to reach across from the bubble to the line that belongs to it.
   */
  const setConnectorActive = useCallback((id: string, active: boolean) => {
    const entry = connectors.current.get(id);
    if (!entry) return;
    for (const node of [entry.line, entry.dot]) {
      if (!node) continue;
      node.style.strokeWidth = active ? "2" : "";
      node.style.opacity = active ? "1" : "";
    }
  }, []);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const measure = () => {
      const bounds = layer.getBoundingClientRect();
      // Measured from the rendered nodes rather than from a selector per pin, so
      // an id needs no escaping (a day key is safe, a label would not be).
      const measured = new Map(
        [...layer.querySelectorAll<HTMLElement>("[data-pin-id]")].map((el) => [el.dataset.pinId, el.getBoundingClientRect()]),
      );

      const boxes = pins.flatMap((pin) => {
        const size = measured.get(pin.id);
        if (!size) return [];
        const { width, height } = size;
        // Provisional: the callout's natural resting spot before collisions, and
        // always *clear of* its own anchor — a bubble covering the point it marks
        // would have nowhere to draw its leader from. Vertically placed pins hang
        // above their date; horizontally placed ones sit beside their row, centred
        // on it.
        const resting = axis === "y"
          ? { x: pin.anchorX - width / 2, y: pin.anchorY - height - 6 }
          : { x: pin.anchorX + 10, y: pin.anchorY - height / 2 };
        return [{ id: pin.id, ...resting, w: width, h: height }];
      });

      const next = axis === "y"
        ? layoutByDate(pins, boxes)
        : placePins(boxes, {
            axis,
            direction: 1,
            container: { width: bounds.width, height: bounds.height },
          }).map((box) => ({ id: box.id, left: box.x, top: box.y, width: box.w, height: box.h }));

      // Sizes don't depend on position, so a re-measure returns the same boxes and
      // this stops: the guard is what keeps the layout pass from looping.
      setPlaced((current) => (samePlaced(current, next) ? current : next));

      if (onLayout) {
        // How far each group's stack reaches past the room its card already has.
        // The measure is taken against the card's *days*, which a spacer below them
        // doesn't move — so growing the card can't feed back into this number.
        const spacers: Record<string, number> = {};
        for (const pin of pins) {
          const box = next.find((candidate) => candidate.id === pin.id);
          const bottom = pin.laneArea?.bottom;
          if (!box || bottom === undefined || !pin.group) continue;
          const overhang = box.top + box.height - bottom;
          if (overhang > (spacers[pin.group] ?? 0)) spacers[pin.group] = Math.ceil(overhang);
        }
        onLayout(spacers);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    return () => observer.disconnect();
  }, [pins, axis, onLayout]);

  if (pins.length === 0) return null;

  return (
    <div
      ref={layerRef}
      // Decorative only. Left in the tree once the pins are buttons, so a screen
      // reader can reach them instead of announcing an empty region.
      aria-hidden={onSelect ? undefined : true}
      className={cn("pointer-events-none absolute inset-0 z-20", className)}
    >
      {/* Leaders first, so a bubble always paints over its own line. A horizontally
          placed pin carries its point on its own body instead, so it draws none of
          this: the bubble sits beside the row it marks, and a line across the grid
          only cluttered it. */}
      {axis === "y" ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {placed.map((pin) => {
            const source = pins.find((candidate) => candidate.id === pin.id);
            if (!source) return null;
            const target = nearestPointOnBox(source.anchorX, source.anchorY, pin);
            if (!target) return null;
            return (
              <g key={pin.id}>
                <line
                  ref={(el) => {
                    const entry = connectors.current.get(pin.id) ?? { line: null, dot: null };
                    entry.line = el;
                    connectors.current.set(pin.id, entry);
                  }}
                  x1={source.anchorX}
                  y1={source.anchorY}
                  x2={target.x}
                  y2={target.y}
                  strokeWidth={1}
                  className="stroke-black/25 transition-[stroke-width,opacity] duration-150 dark:stroke-white/35"
                />
                {/* The point itself: a small diamond sitting on the date. */}
                <path
                  ref={(el) => {
                    const entry = connectors.current.get(pin.id) ?? { line: null, dot: null };
                    entry.dot = el;
                    connectors.current.set(pin.id, entry);
                  }}
                  d="M0,-3.5 L3.5,0 L0,3.5 L-3.5,0 Z"
                  transform={`translate(${source.anchorX} ${source.anchorY})`}
                  className="fill-white stroke-black/25 dark:fill-neutral-800 dark:stroke-white/35"
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </svg>
      ) : null}

      {pins.map((pin) => {
        const [primaryId] = pin.eventIds ?? [];
        const position = placed.find((candidate) => candidate.id === pin.id);
        // A lane is narrower than a bubble's natural width, so the bubble is told
        // how much room it has and lets its label wrap inside that.
        const bubbleStyle = position?.constrained ? { width: position.width } : undefined;

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
            {/* A horizontally placed pin points at its row from its own left edge:
                the bubble already sits beside the day, so the point belongs on the
                body rather than on a line across the grid. */}
            {axis === "x" ? (
              <span
                aria-hidden
                className="absolute h-2 w-2 rotate-45 border-l border-b border-black/10 bg-white dark:border-white/20 dark:bg-neutral-800"
                style={{ left: -4, top: "50%", marginTop: -4 }}
              />
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
            className="group/pin pointer-events-auto absolute"
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
                onPointerEnter={() => setConnectorActive(pin.id, true)}
                onPointerLeave={() => setConnectorActive(pin.id, false)}
                onFocus={() => setConnectorActive(pin.id, true)}
                onBlur={() => setConnectorActive(pin.id, false)}
                aria-label={`Edit ${pin.label}`}
                className={cn(shell, "cursor-pointer transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700")}
                style={bubbleStyle}
              >
                {bubble}
              </button>
            ) : (
              <div className={shell} style={bubbleStyle}>
                {bubble}
              </div>
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

/**
 * Lay a year's pins out in date order, one month card at a time.
 *
 * A card is ~250px wide and a bubble can be 208, so a single column pushes the
 * second pin of a busy month hundreds of pixels above its own dates. Two lanes
 * halve that: pins alternate between them in date order, and each lane stacks
 * downward, so a later date is never drawn above an earlier one.
 *
 * Everything stays visible — this is about order, not filtering. A pin that
 * cannot sit beside its date is pushed down until it clears the last one in its
 * lane, which keeps the sequence readable however many there are.
 */
function layoutByDate(pins: readonly YearPin[], boxes: readonly PinBox[]): Placed[] {
  const placed: Placed[] = [];
  const groups = new Map<string, { pin: YearPin; box: PinBox }[]>();

  for (const box of [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const pin = pins.find((candidate) => candidate.id === box.id);
    if (!pin) continue;
    const key = pin.group ?? "";
    const list = groups.get(key);
    if (list) list.push({ pin, box });
    else groups.set(key, [{ pin, box }]);
  }

  for (const list of groups.values()) {
    const band = list[0].pin.laneArea;
    const roomForTwo = !!band && band.width >= MIN_LANE_WIDTH * 2 + LANE_GAP;
    const lanes = roomForTwo && list.length >= LANES_FROM_COUNT ? 2 : 1;
    const laneWidth = band ? (band.width - LANE_GAP * (lanes - 1)) / lanes : 0;
    const bottoms = Array.from({ length: lanes }, () => Number.NEGATIVE_INFINITY);

    // Date order within the group: `boxes` arrived sorted by anchor y.
    list.forEach(({ box }, index) => {
      const lane = index % lanes;
      const left = band ? band.left + lane * (laneWidth + LANE_GAP) : box.x;
      // Never above the card's header, never above the pin already in this lane:
      // the sequence stays readable and the month keeps its name.
      const top = Math.max(box.y, bottoms[lane] + PIN_GAP, band?.top ?? Number.NEGATIVE_INFINITY);
      bottoms[lane] = top + box.h;
      placed.push({ id: box.id, left, top, width: laneWidth || box.w, height: box.h, constrained: lanes > 1 });
    });
  }

  return placed.sort((a, b) => a.top - b.top || a.left - b.left);
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
        pin.constrained === b[index].constrained &&
        pin.height === b[index].height,
    )
  );
}
