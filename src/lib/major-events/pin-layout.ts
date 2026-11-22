/**
 * Pin placement for the year views: each major event is pinned above its day, and
 * when two would land on top of each other the later one is moved until it
 * clears — map-label placement, in a few lines.
 *
 * Pure and view-agnostic so the mood grid (DOM cells) and the activity grid
 * (canvas rows) place their pins the same way, and so the rule is testable
 * without a browser. They do not move the same way, because a pin sits over
 * different things: the mood grid puts one above a date's own cell, so a
 * sideways nudge would land it over a neighbouring date and it slides down
 * instead; the activity grid puts one on the day's *row*, where sliding down
 * would leave the row, so it shifts sideways along the row.
 */

export interface PinBox {
  id: string;
  /** Target position, in the container's CSS pixels. */
  x: number;
  y: number;
  /** Estimated footprint. Only used for collision, so it can be approximate. */
  w: number;
  h: number;
}

/**
 * The footprint every year-view pin is assumed to cover. Both grids place pins
 * with this, so the same stretch of a year nudges the same way in each — a pin's
 * real width depends on its label, so this is the estimate, not a measurement.
 */
export const PIN_BOX = { w: 130, h: 30 } as const;

interface PlaceOptions {
  /**
   * Which way a colliding pin may move. Defaults to `y` — down the page.
   *
   * A pin that cannot clear within `maxSteps` is left where it was rather than
   * pushed further: a pin over a later date or a different row is a worse lie
   * than two pins overlapping, which at least still belong to the right day.
   */
  axis?: "x" | "y";
  /**
   * How far a pin moves on each retry. Defaults to a pin's own height going down,
   * and just past its own width going sideways — a bubble's real width is what it
   * has to clear, so one nudge should land it beside its neighbour.
   */
  step?: number;
  /** Stop retrying past this many nudges (keeps a dense year bounded). */
  maxSteps?: number;
}

const overlaps = (a: PinBox, b: PinBox) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Resolve target boxes into non-overlapping positions.
 *
 * A pin keeps its anchor on the axis it is not allowed to move on. Sideways it
 * tries right and left alternately, so a cluster spreads both ways; downwards it
 * only ever goes down, because a pin nudged up would cover the date before its
 * own.
 *
 * Returns the boxes themselves with a settled position, so a caller keeps
 * whatever else it hung on them (a label, the events behind the pin) without a
 * lookup.
 */
export function placePins<T extends PinBox>(
  boxes: readonly T[],
  { axis = "y", step, maxSteps = 12 }: PlaceOptions = {},
): T[] {
  const placed: T[] = [];

  for (const box of [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const pitch = step ?? (axis === "x" ? box.w + 4 : box.h + 4);
    let resolved = box;
    if (placed.some((taken) => overlaps(box, taken))) {
      for (let nudge = 1; nudge <= maxSteps; nudge += 1) {
        // Sideways alternates left/right so a cluster spreads both ways. Downwards
        // only ever goes down: a pin nudged up would cover the date before its own.
        const offset = axis === "x" ? Math.ceil(nudge / 2) * pitch * (nudge % 2 === 1 ? 1 : -1) : nudge * pitch;
        const candidate = axis === "x" ? { ...box, x: box.x + offset } : { ...box, y: box.y + offset };
        if (!placed.some((taken) => overlaps(candidate, taken))) {
          resolved = candidate;
          break;
        }
      }
    }
    placed.push({ ...resolved });
  }

  return placed;
}
