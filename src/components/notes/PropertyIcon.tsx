"use client";

import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { cn } from "@/lib/shared/utils";

import { getPropertyCustomIcon, getPropertyIcon } from "./query-block-helpers";
import type { PropertyDefinitionRow } from "@/hooks/use-property-definitions";

/**
 * A property's icon: the one it was given, else the one its type implies.
 *
 * Both halves of that choice were written out at every place a property is
 * listed — the filter picker, the column picker, the column headers — and each
 * of them looked its component up during render and rendered it as `<Icon />`.
 * A component pulled out of a lookup mid-render is one React cannot assume is
 * the same one as last time, which `react-hooks/static-components` rightly
 * flags — it just cannot see that these come from a module-level table and a
 * module's exports, so the identity never actually changes. Doing the lookup
 * here means that judgement is made once, with the reason next to it, instead
 * of at each of the four places properties are listed.
 *
 * `size` is the sprite's pixel size; `className` sizes the fallback, which is an
 * SVG component that takes its dimensions from classes.
 */
export function PropertyIcon({
  propertyId,
  definitions,
  size = 14,
  className,
}: {
  propertyId: string;
  definitions: PropertyDefinitionRow[];
  size?: number;
  className?: string;
}) {
  const custom = getPropertyCustomIcon(propertyId, definitions);
  if (custom) return <SpriteIcon name={custom} size={size} className="shrink-0" />;

  const Icon = getPropertyIcon(propertyId, definitions);
  // Safe for the reason above: `PROPERTY_TYPE_ICONS` is a module-level constant,
  // so the same type always yields the very same component.
  // eslint-disable-next-line react-hooks/static-components
  return <Icon className={cn("shrink-0", className)} />;
}
