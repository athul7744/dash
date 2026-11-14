/**
 * The shell for a utility control at the edge of a collection toolbar: square
 * where filters are round and flat. Shared so the tag filter and the sort menu
 * can't drift.
 *
 * The height and the ring are separate on purpose: a control that is painted in
 * a tag's own colour keeps that colour's border instead of stacking a ring on
 * top of it, and one that sits beside a search field matches the field's height.
 */
export const TOOL_BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-background font-heading text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export const TOOL_BUTTON_SIZE = "h-8 px-2 sm:px-3";

export const TOOL_BUTTON_CLASS = `${TOOL_BUTTON_BASE} ${TOOL_BUTTON_SIZE} ring-1 ring-border`;
