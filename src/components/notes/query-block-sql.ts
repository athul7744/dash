import type { PropertyDefinitionRow } from "@/hooks/use-property-definitions";
import type { QueryBlockConfig, QueryFilterCondition } from "@/lib/notes/query-block";
import { BUILT_IN_PROPERTIES } from "@/lib/notes/query-block";
import { decodeQueryConfig } from "@/lib/notes/query-block-content";
import type { PropertyType } from "@/components/notes/page/types";

export type QueryResultRow = {
  id: string;
  title: string;
  properties: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export function parseConfig(content: string | null | undefined): QueryBlockConfig {
  return decodeQueryConfig(content);
}

export function getPropertyType(propertyId: string, definitions: PropertyDefinitionRow[]): PropertyType | "title" | "date_meta" | "tags" {
  const builtin = BUILT_IN_PROPERTIES.find((p) => p.id === propertyId);
  if (builtin) return builtin.type;
  const def = definitions.find((d) => d.id === propertyId);
  if (def) return def.type as PropertyType;
  return "text";
}

export function getPropertyName(propertyId: string, definitions: PropertyDefinitionRow[]): string {
  const builtin = BUILT_IN_PROPERTIES.find((p) => p.id === propertyId);
  if (builtin) return builtin.name;
  const def = definitions.find((d) => d.id === propertyId);
  return def?.name ?? propertyId;
}

/** Build SQL WHERE clause fragments from filter conditions */
export function buildQuerySQL(config: QueryBlockConfig, definitions: PropertyDefinitionRow[]): { sql: string; params: unknown[] } {
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  for (const filter of config.filters) {
    const clause = buildFilterClause(filter, definitions, params);
    if (clause) whereClauses.push(clause);
  }

  let sql = "SELECT id, title, properties, created_at, updated_at FROM pages";
  if (whereClauses.length > 0) {
    sql += " WHERE " + whereClauses.join(" AND ");
  }

  // Sort
  if (config.sort) {
    const col = getSortColumn(config.sort.propertyId, definitions);
    if (col) {
      sql += ` ORDER BY ${col} ${config.sort.direction === "desc" ? "DESC" : "ASC"}`;
    }
  } else {
    sql += " ORDER BY updated_at DESC";
  }

  sql += ` LIMIT ?`;
  params.push(config.limit ?? 20);

  return { sql, params };
}

function getSortColumn(propertyId: string, definitions: PropertyDefinitionRow[]): string | null {
  if (propertyId === "__title__") return "title";
  if (propertyId === "__created_at__") return "created_at";
  if (propertyId === "__updated_at__") return "updated_at";
  const def = definitions.find((d) => d.id === propertyId);
  if (def) return `json_extract(properties, '$.custom."${def.id}"')`;
  return null;
}

function buildFilterClause(filter: QueryFilterCondition, definitions: PropertyDefinitionRow[], params: unknown[]): string | null {
  const { propertyId, operator, value } = filter;

  let col: string;
  if (propertyId === "__title__") col = "title";
  else if (propertyId === "__created_at__") col = "created_at";
  else if (propertyId === "__tags__") {
    // Tags are stored as a JSON array in properties.tags
    switch (operator) {
      case "is_any":
        if (Array.isArray(value) && value.length > 0) {
          const conditions = value.map(() => `json_extract(properties, '$.tags') LIKE ?`);
          value.forEach((v) => params.push(`%${JSON.stringify(v).slice(1, -1)}%`));
          return `(${conditions.join(" OR ")})`;
        }
        return null;
      case "is_none":
        if (Array.isArray(value) && value.length > 0) {
          const conditions = value.map(() => `json_extract(properties, '$.tags') NOT LIKE ?`);
          value.forEach((v) => params.push(`%${JSON.stringify(v).slice(1, -1)}%`));
          return `(${conditions.join(" AND ")})`;
        }
        return null;
      case "is_empty":
        return `(json_extract(properties, '$.tags') IS NULL OR json_extract(properties, '$.tags') = '[]')`;
      case "is_not_empty":
        return `(json_extract(properties, '$.tags') IS NOT NULL AND json_extract(properties, '$.tags') != '[]')`;
      default:
        return null;
    }
  }
  else if (propertyId === "__updated_at__") col = "updated_at";
  else col = `json_extract(properties, '$.custom."${propertyId}"')`;

  switch (operator) {
    case "contains":
      params.push(`%${value}%`);
      return `${col} LIKE ?`;
    case "not_contains":
      params.push(`%${value}%`);
      return `${col} NOT LIKE ?`;
    case "equals":
    case "is":
    case "eq":
      params.push(value);
      return `${col} = ?`;
    case "not_equals":
    case "neq":
      params.push(value);
      return `${col} != ?`;
    case "gt":
      params.push(value);
      return `${col} > ?`;
    case "lt":
      params.push(value);
      return `${col} < ?`;
    case "gte":
      params.push(value);
      return `${col} >= ?`;
    case "lte":
      params.push(value);
      return `${col} <= ?`;
    case "is_empty":
      return `(${col} IS NULL OR ${col} = '')`;
    case "is_not_empty":
      return `(${col} IS NOT NULL AND ${col} != '')`;
    case "is_before":
      params.push(value);
      return `${col} < ?`;
    case "is_after":
      params.push(value);
      return `${col} > ?`;
    case "is_within": {
      // value is like "7d", "2w", "1m", "1y"
      const duration = parseDuration(value as string);
      if (!duration) return null;
      params.push(duration.sqlModifier);
      return `${col} >= datetime('now', ?)`;
    }
    case "is_checked":
      return `${col} = 'true'`;
    case "is_unchecked":
      return `(${col} IS NULL OR ${col} != 'true')`;
    case "is_any":
      if (Array.isArray(value) && value.length > 0) {
        const placeholders = value.map(() => "?").join(", ");
        params.push(...value);
        return `${col} IN (${placeholders})`;
      }
      return null;
    case "is_none":
      if (Array.isArray(value) && value.length > 0) {
        const placeholders = value.map(() => "?").join(", ");
        params.push(...value);
        return `${col} NOT IN (${placeholders})`;
      }
      return null;
    default:
      return null;
  }
}

// --- Duration helpers ---

type ParsedDuration = { amount: number; unit: "d" | "w" | "m" | "y"; sqlModifier: string };

export function parseDuration(value: string | undefined | null): ParsedDuration | null {
  if (!value) return null;
  const match = value.match(/^(\d+)([dwmy])$/);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2] as "d" | "w" | "m" | "y";
  const sqlModifier = durationToSQLite(amount, unit);
  return { amount, unit, sqlModifier };
}

function durationToSQLite(amount: number, unit: "d" | "w" | "m" | "y"): string {
  switch (unit) {
    case "d": return `-${amount} days`;
    case "w": return `-${amount * 7} days`;
    case "m": return `-${amount} months`;
    case "y": return `-${amount} years`;
  }
}
