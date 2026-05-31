import type { PropertyDefinitionConfig, PropertyType, ResolvedPageProperty } from "@/components/notes/page/types";
import type { PropertyDefinitionRow } from "@/hooks/use-property-definitions";

export function parseDefinitionConfig(raw: string | null | undefined): PropertyDefinitionConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (typeof parsed === "object" && parsed !== null) ? (parsed as PropertyDefinitionConfig) : {};
  } catch {
    return {};
  }
}

export function resolveProperties(
  definitions: PropertyDefinitionRow[],
  customValues: Record<string, unknown>
): ResolvedPageProperty[] {
  const assignedIds = new Set(Object.keys(customValues));

  return definitions
    .filter((def) => assignedIds.has(def.id))
    .map((def) => ({
      definitionId: def.id,
      name: def.name ?? "",
      type: (def.type ?? "text") as PropertyType,
      config: parseDefinitionConfig(def.config),
      value: customValues[def.id] ?? null,
    }));
}

const OPTION_BADGE_COLORS = [
  "bg-gray-100 text-gray-700 dark:bg-gray-800/80 dark:text-gray-300",
  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
];

export function getOptionBadgeStyle(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % OPTION_BADGE_COLORS.length;
  return OPTION_BADGE_COLORS[index];
}
