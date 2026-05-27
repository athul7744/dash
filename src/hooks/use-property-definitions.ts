"use client";

import { useQuery } from "@powersync/react";

import type { PropertyDefinitionRecord } from "@/lib/powersync/AppSchema";

export type PropertyDefinitionRow = PropertyDefinitionRecord & { id: string };

export function usePropertyDefinitions() {
  const { data = [], isLoading } = useQuery<PropertyDefinitionRow>(
    "SELECT id, user_id, name, type, config, created_at FROM property_definitions ORDER BY created_at ASC"
  );

  return {
    definitions: data,
    isLoading,
  };
}
