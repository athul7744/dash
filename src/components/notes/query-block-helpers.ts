import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Clock,
  Globe,
  Hash,
  Tag,
  Type,
} from "lucide-react";

import type { PropertyDefinitionRow } from "@/hooks/use-property-definitions";
import type { PropertyType } from "@/components/notes/page/types";
import { getPropertyType } from "./query-block-sql";

export const PROPERTY_TYPE_ICONS: Record<PropertyType | "title" | "date_meta" | "tags", typeof Type> = {
  text: Type,
  number: Hash,
  date: CalendarIcon,
  date_meta: Clock,
  select: ChevronDown,
  checkbox: Check,
  url: Globe,
  title: Type,
  tags: Tag,
};

export function getPropertyIcon(propertyId: string, definitions: PropertyDefinitionRow[]) {
  const propType = getPropertyType(propertyId, definitions);
  return PROPERTY_TYPE_ICONS[propType] ?? Type;
}

export function getPropertyCustomIcon(propertyId: string, definitions: PropertyDefinitionRow[]): string | null {
  const def = definitions.find((d) => d.id === propertyId);
  if (!def) return null;
  const config = def.config ? JSON.parse(def.config) : {};
  return config.icon ?? null;
}

export function getOptionBadgeStyle(text: string) {
  const colors = [
    "bg-gray-100 text-gray-700 dark:bg-gray-800/80 dark:text-gray-300",
    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  ];
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
