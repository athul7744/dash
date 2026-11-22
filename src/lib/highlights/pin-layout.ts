/**
 * Pin placement for the year views: each highlight is pinned near its day, and
 * when two would land on top of each other one is moved until it clears —
 * map-label placement, in a few lines.
 *
 * Pure and view-agnostic so the mood grid (DOM cells) and the activity grid
 * (canvas rows) place their pins the same way, and so the rule is testable
 * without a browser. They differ only in which way a pin may move: the mood grid
 * moves pins vertically, away from the dates below them; the activity grid moves
 * them along the day's row, because a vertical move there would leave the row.
 *
 * Boxes are the bubbles' **measured** sizes, so "does this collide" is answered
 * exactly rather than from an estimate.
 */

export interface PinBox {
  id: string;
  /** Top-left of the bubble, in the container's CSS pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far inside the container's edges a bubble stays, at minimum. */
export const PIN_EDGE_MARGIN = 4;

interface PlaceOptions {
  /** Which way a colliding pin may move. Defaults to `y` — vertically. */
  axis?: "x" | "y";
  /**
   * Which way a `y`-axis nudge goes. `1` (default) is down the page, `-1` is up —
   * for a grid that hangs pins above their date and would otherwise drag a bubble
   * over the dates below it.
   */
  direction?: 1 | -1;
  /**
   * How far a pin moves on each retry. Defaults to a pin's own size plus the gap
   * it wants: a bubble has to clear the one beside it, so one nudge should do.
   */
  step?: number;
  /** Stop retrying past this many nudges (keeps a dense year bounded). */
  maxSteps?: number;
  /** The container the bubbles have to stay inside. */
  container: { width: number; height: number };
}

const overlaps = (a: PinBox, b: PinBox) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Pull a box back inside the container, keeping the margin it draws with.
 *
 * `y` is only clamped when the pins are placed vertically. A horizontally placed
 * grid anchors pins to rows that can sit outside the visible window (the activity
 * canvas scrolls), and pulling those into the window would stack every off-screen
 * pin along its bottom edge.
 */
function fitToContainer<T extends PinBox>(
  box: T,
  { width, height }: { width: number; height: number },
  clampY: boolean,
): T {
  return {
    ...box,
    x: clamp(box.x, PIN_EDGE_MARGIN, Math.max(PIN_EDGE_MARGIN, width - box.w - PIN_EDGE_MARGIN)),
    ...(clampY
      ? { y: clamp(box.y, PIN_EDGE_MARGIN, Math.max(PIN_EDGE_MARGIN, height - box.h - PIN_EDGE_MARGIN)) }
      : {}),
  };
}

/**
 * Resolve overlapping boxes into settled positions, every one inside the
 * container.
 *
 * A pin keeps its position on the axis it is not allowed to move on. A pin that
 * cannot clear within `maxSteps` stays on its own anchor rather than wandering to
 * a different date: two overlapping bubbles that both point at the right days
 * beat one that points at the wrong day.
 *
 * Returns the boxes with their settled position, so a caller keeps whatever else
 * it hung on them (a label, the highlights behind the pin) without a lookup.
 */
export function placePins<T extends PinBox>(
  boxes: readonly T[],
  { axis = "y", direction = 1, step, maxSteps = 12, container }: PlaceOptions,
): T[] {
  const placed: T[] = [];
  const clampY = axis === "y";

  for (const box of [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const pitch = step ?? (axis === "x" ? box.w + PIN_EDGE_MARGIN : box.h + PIN_EDGE_MARGIN);
    const anchored = fitToContainer(box, container, clampY);
    let resolved = anchored;

    if (placed.some((taken) => overlaps(anchored, taken))) {
      for (let nudge = 1; nudge <= maxSteps; nudge += 1) {
        // Sideways alternates right and left so a cluster spreads both ways;
        // vertically it only ever goes one way, so a pin never lands on the date
        // before the one it belongs to.
        const offset = axis === "x"
          ? Math.ceil(nudge / 2) * pitch * (nudge % 2 === 1 ? 1 : -1)
          : nudge * pitch * direction;
        const moved = axis === "x" ? { ...anchored, x: anchored.x + offset } : { ...anchored, y: anchored.y + offset };
        // Clamping moves a sideways nudge onto the edge; a nudge that the clamp
        // took back to where it started cannot help, so it is skipped.
        const candidate = fitToContainer(moved, container, clampY);
        const movedFarEnough = axis === "x" ? candidate.x !== anchored.x : candidate.y !== anchored.y;
        if (movedFarEnough && !placed.some((taken) => overlaps(candidate, taken))) {
          resolved = candidate;
          break;
        }
      }
    }

    placed.push(resolved);
  }

  return placed;
}
