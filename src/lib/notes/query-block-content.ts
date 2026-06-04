import type { QueryBlockConfig, QueryFilterCondition, QuerySortConfig } from "@/lib/notes/query-block";

/**
 * Query blocks store their config as a normal note document so that ALL block
 * content has a uniform shape (`{ type: "doc", content: [...] }`). The config
 * lives in the `attrs` of a single `queryBlock` node, which survives
 * normalizeNoteDocument untouched (it preserves typed nodes and their attrs).
 *
 * This codec is the single encode/decode seam between the query UI (which works
 * in terms of `QueryBlockConfig`) and the stored note document, so the block
 * store never needs to special-case query content.
 */
export const QUERY_BLOCK_NODE_TYPE = "queryBlock";

export interface QueryBlockDocument {
  type: "doc";
  content: { type: string; attrs: Record<string, unknown> }[];
}

/** Encode a query config into the canonical `queryBlock` note document. */
export function encodeQueryConfig(config: QueryBlockConfig): QueryBlockDocument {
  return {
    type: "doc",
    content: [
      {
        type: QUERY_BLOCK_NODE_TYPE,
        attrs: {
          filters: config.filters ?? [],
          columns: config.columns ?? [],
          sort: config.sort ?? null,
          limit: config.limit ?? 20,
        },
      },
    ],
  };
}

/**
 * Decode a query config from stored content. Tolerant of:
 * - the canonical doc form (`{ type: "doc", content: [{ type: "queryBlock", attrs }] }`)
 * - the legacy raw-config form (`{ filters, columns, sort, limit }`)
 * - serialized JSON strings of either form
 */
export function decodeQueryConfig(content: unknown): QueryBlockConfig {
  const attrs = extractQueryAttrs(toRecord(content));
  return {
    filters: Array.isArray(attrs?.filters) ? (attrs.filters as QueryFilterCondition[]) : [],
    columns: Array.isArray(attrs?.columns) ? (attrs.columns as string[]) : [],
    sort: (attrs?.sort as QuerySortConfig | undefined) ?? undefined,
    limit: typeof attrs?.limit === "number" ? (attrs.limit as number) : 20,
  };
}

function toRecord(content: unknown): Record<string, unknown> | null {
  if (!content) return null;
  if (typeof content === "string") {
    try {
      const parsed: unknown = JSON.parse(content);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof content === "object" ? (content as Record<string, unknown>) : null;
}

function extractQueryAttrs(record: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!record) return null;

  // Canonical doc form: find the queryBlock node and read its attrs.
  if (record.type === "doc" && Array.isArray(record.content)) {
    const node = record.content.find(
      (child): child is Record<string, unknown> =>
        Boolean(child) && typeof child === "object" && (child as Record<string, unknown>).type === QUERY_BLOCK_NODE_TYPE
    );
    const attrs = node?.attrs;
    return attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : null;
  }

  // Legacy raw-config form: the record itself holds the config fields.
  if ("filters" in record || "columns" in record || "limit" in record || "sort" in record) {
    return record;
  }

  return null;
}
