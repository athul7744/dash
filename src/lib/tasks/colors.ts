import { ITEM_COLORS, itemColor } from "@/lib/shared/item-colors";

export const TAG_COLORS = ITEM_COLORS;

export const getTagColorClasses = (color: string) => itemColor(color).tag;

export const getTagDotClass = (color: string) => itemColor(color).dot;
