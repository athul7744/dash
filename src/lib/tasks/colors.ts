import { ITEM_COLORS, itemColor } from "@/lib/shared/item-colors";

export const TAG_COLORS = ITEM_COLORS;

export const getTagColorClasses = (color: string) => itemColor(color).tag;

export const getTagDotClass = (color: string) => itemColor(color).dot;

/**
 * The colour names of an entity's tags, in order, keeping only ones that still
 * exist and have a colour.
 *
 * For surfaces that show one mark rather than the pills — a timeline rail, a pin
 * — so "which colours is this thing?" is answered in one place. `max` matches the
 * mark: two colours can be shown split, more cannot.
 */
export function tagColors(
  tagIds: readonly string[],
  tags: readonly { id: string; color: string | null }[],
  max = 2,
): string[] {
  const colors: string[] = [];
  for (const tagId of tagIds) {
    const tag = tags.find((candidate) => candidate.id === tagId);
    if (tag?.color) colors.push(tag.color);
    if (colors.length === max) break;
  }
  return colors;
}
