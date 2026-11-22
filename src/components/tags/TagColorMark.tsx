"use client";

import { itemColor } from "@/lib/shared/item-colors";
import { cn } from "@/lib/shared/utils";

/**
 * A tag colour, or two, as one small squircle.
 *
 * A highlight has no colour of its own — it wears its tags' — so anywhere a
 * single mark has to stand for it (a pin, the year rail, a day popover) this
 * draws one: solid for a single tag, split corner to corner for a pair, so both
 * colours are visible at the size of a dot.
 *
 * `colors` are palette names (`ITEM_COLORS`); unknown or missing ones are skipped,
 * and nothing renders when none are left.
 */
export function TagColorMark({
  colors,
  size = 12,
  className,
}: {
  colors: readonly string[];
  /** Edge length in px. The corner radius follows it, to stay a squircle. */
  size?: number;
  className?: string;
}) {
  const [first, second] = colors.filter(Boolean);
  if (!first) return null;

  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 ring-1 ring-inset ring-black/10 dark:ring-white/20",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        ...(second
          ? { backgroundImage: `linear-gradient(135deg, ${itemColor(first).hex} 0 50%, ${itemColor(second).hex} 50% 100%)` }
          : { backgroundColor: itemColor(first).hex }),
      }}
    />
  );
}
