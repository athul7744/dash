"use client";

import { cn } from "@/lib/shared/utils";

interface ColorSwatchesProps {
  /** The palette, usually `ITEM_COLORS`. */
  colors: readonly string[];
  /** Currently chosen colour name. */
  value: string;
  onChange: (color: string) => void;
  /** Dot class per colour name — `getTagDotClass` for the shared palette. */
  getDotClass: (color: string) => string;
  /** Used in the default accessible name: "Select <itemTypeLabel> color amber". */
  itemTypeLabel: string;
  /**
   * `md` is the create row (24px, ring-offset 2), `sm` the inline editor's
   * popover (20px, ring-offset 1) — the two sizes the manage dialog already used.
   */
  size?: "sm" | "md";
  className?: string;
  /** Override the accessible name per swatch (e.g. to include the item's name). */
  getAriaLabel?: (color: string) => string;
}

/**
 * A row of colour dots for picking one of the shared named colours.
 *
 * Extracted from `ManageNamedColorItemsDialog`, which drew the same strip twice
 * with different sizes; anything else that picks an item colour (a tag, a folder,
 * a highlight) uses this so the palette and the selected-state ring stay
 * identical everywhere.
 */
export function ColorSwatches({
  colors,
  value,
  onChange,
  getDotClass,
  itemTypeLabel,
  size = "md",
  className,
  getAriaLabel,
}: ColorSwatchesProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={getAriaLabel?.(color) ?? `Select ${itemTypeLabel} color ${color}`}
          aria-pressed={value === color}
          title={color}
          className={cn(
            "cursor-pointer rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            size === "sm" ? "h-5 w-5" : "h-6 w-6",
            getDotClass(color),
            value === color && "scale-110 ring-2 ring-primary",
            value === color && (size === "sm" ? "ring-offset-1 ring-offset-background" : "ring-offset-2 ring-offset-background")
          )}
        />
      ))}
    </div>
  );
}
