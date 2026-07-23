"use client";

/**
 * Reactive backlinks: every entity that links *to* `targetId`, resolved to
 * `{ kind, id, label }` and deduped (note sources collapse block → page, so a
 * note linking from several blocks shows once). Drives the per-card backlinks
 * row and the notes rail.
 */

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import { refTypeSql } from "@/lib/links/links";
import {
  classifyEntityRow,
  ENTITY_JOIN_SQL,
  ENTITY_JOIN_FROM,
  type EntityJoinRow,
  type ResolvedEntity,
} from "@/lib/links/resolve";

const EMPTY = `SELECT ${ENTITY_JOIN_SQL} FROM edges e ${ENTITY_JOIN_FROM} WHERE 1 = 0`;

export function useBacklinks(targetId?: string | null): ResolvedEntity[] {
  const query = targetId
    ? `SELECT ${ENTITY_JOIN_SQL} FROM edges e ${ENTITY_JOIN_FROM} WHERE e.target_id = ? AND ${refTypeSql("e")}`
    : EMPTY;
  const { data = [] } = useQuery<EntityJoinRow>(query, targetId ? [targetId] : []);

  return useMemo(() => {
    const seen = new Set<string>();
    const out: ResolvedEntity[] = [];
    for (const row of data) {
      const resolved = classifyEntityRow(row);
      if (!resolved) continue;
      const key = `${resolved.kind}:${resolved.id}`;
      if (seen.has(key) || resolved.id === targetId) continue;
      seen.add(key);
      out.push(resolved);
    }
    return out;
  }, [data, targetId]);
}
