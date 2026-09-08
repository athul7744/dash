"use client";

import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";

import type { PropertyType, PropertyDefinitionConfig } from "@/components/notes/page/types";

// ---------------------------------------------------------------------------
// Property definition CRUD
// ---------------------------------------------------------------------------

export async function createPropertyDefinition(
  name: string,
  type: PropertyType,
  config: PropertyDefinitionConfig = {}
): Promise<string> {
  const id = uuidv4();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO property_definitions (id, user_id, name, type, config, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, name.trim(), type, JSON.stringify(config), now]
  );

  return id;
}

export async function updatePropertyDefinitionName(
  definitionId: string,
  name: string
) {
  await db.execute(
    `UPDATE property_definitions SET name = ? WHERE id = ?`,
    [name.trim(), definitionId]
  );
}

export async function updatePropertyDefinitionConfig(
  definitionId: string,
  config: PropertyDefinitionConfig
) {
  await db.execute(
    `UPDATE property_definitions SET config = ? WHERE id = ?`,
    [JSON.stringify(config), definitionId]
  );
}

export async function deletePropertyDefinition(definitionId: string) {
  await db.execute(
    `DELETE FROM property_definitions WHERE id = ?`,
    [definitionId]
  );
}

// ---------------------------------------------------------------------------
// Page custom property values – stored in pages.properties.custom
// ---------------------------------------------------------------------------

/**
 * Parse the `custom` key from a page's properties JSONB.
 * Returns a Record<definitionId, value>.
 */
export function parseCustomPropertyValues(
  properties: Record<string, unknown>
): Record<string, unknown> {
  let raw = properties?.custom;

  // Handle case where custom was stored as a JSON string
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return {}; }
  }

  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return {};
}

/**
 * Resolve property-definition names to ids, creating the missing ones.
 *
 * The markdown importer decides its whole set of definitions up front (from the
 * mapping screen) and needs their ids before it starts writing pages, so it can
 * store values keyed by definition id. Matching is case-insensitive on name, so a
 * second import reuses what the first one created instead of adding a twin.
 */
export async function ensurePropertyDefinitions(
  wanted: ReadonlyArray<{ name: string; type: PropertyType; config?: PropertyDefinitionConfig }>,
): Promise<Map<string, string>> {
  const byKey = new Map<string, { name: string; type: PropertyType; config?: PropertyDefinitionConfig }>();
  for (const definition of wanted) {
    const key = definition.name.trim().toLowerCase();
    if (key && !byKey.has(key)) byKey.set(key, definition);
  }
  if (byKey.size === 0) return new Map();

  const existing = await db.getAll<{ id: string; name: string | null }>(
    "SELECT id, name FROM property_definitions",
  );
  const idByKey = new Map<string, string>();
  for (const row of existing) {
    const key = (row.name ?? "").trim().toLowerCase();
    if (key && !idByKey.has(key)) idByKey.set(key, row.id);
  }

  for (const [key, definition] of byKey) {
    if (idByKey.has(key)) continue;
    idByKey.set(key, await createPropertyDefinition(definition.name, definition.type, definition.config ?? {}));
  }

  return new Map([...byKey.keys()].map((key) => [key, idByKey.get(key) as string]));
}
