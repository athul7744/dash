import type { ComponentProps } from "react";

import { cn } from "@/lib/shared/utils";

/**
 * The one skeleton vocabulary for the whole app. Pick the variant by surface —
 * the animation classes and tokens live in globals.css (`.skeleton*`) and all
 * fall back to a static box under `prefers-reduced-motion`.
 *
 *  - `<Skeleton />`            — a shimmer bone (the default). Detail pages,
 *                               editors, single surfaces.
 *  - `<SkeletonWave>`         — wraps a long scroll list; its direct children
 *                               breathe in a staggered top-down wave. Put one
 *                               placeholder card/row per child; use plain
 *                               `<Skeleton>` bones inside (they go static so the
 *                               motion stays on the row, not every bone).
 *  - `<SkeletonAurora>`       — a large canvas with an accent glow drifting
 *                               behind frosted bones (tracker grid, dashboard,
 *                               graph boot). Use sparingly.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  // `rounded-md` is the default radius; callers override it with any rounded-*
  // (tailwind-merge dedupes). Radius stays a utility so it isn't beaten by the
  // unlayered `.skeleton` rule.
  return <div className={cn("skeleton rounded-md", className)} {...props} />;
}

/** A long-list container: direct children breathe in a staggered wave. */
export function SkeletonWave({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("skeleton-wave", className)} {...props} />;
}

/**
 * A large canvas whose bones sit over a drifting accent glow. Renders the glow
 * layer itself, then `children` above it.
 */
export function SkeletonAurora({ className, children, ...props }: ComponentProps<"div">) {
  // Box styling is defaults (not in `.skeleton-aurora`) so callers can override
  // via tailwind-merge — e.g. the full-screen dashboard splash passes `absolute
  // inset-0` to override `relative`, and its own `bg-*` to override `bg-muted`.
  return (
    <div className={cn("skeleton-aurora relative isolate overflow-hidden bg-muted", className)} {...props}>
      <div className="skeleton-aurora__glow" aria-hidden />
      {children}
    </div>
  );
}
