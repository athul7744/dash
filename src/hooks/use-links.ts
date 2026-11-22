"use client";

/**
 * Reactive backlinks: every entity that links *to* `targetId`, resolved to
 * `{ kind, id, label }` and deduped (note sources collapse block → page, so a
 * note linking from several blocks shows once). Drives the per-card backlinks
 * row and the notes rail.
 */

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import { REF_TYPE_SQL, refTypeSql } from "@/lib/links/links";
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

/**
 * Which of these pages something links to — a `Set` of the linked ones.
 *
 * Batched for a whole week's journal (one query) rather than a count per entry,
 * which had seven live queries answering the same question on one screen.
 */
export function useLinkedTargets(targetIds: readonly string[]): Set<string> {
  const ids = useMemo(() => [...new Set(targetIds.filter(Boolean))], [targetIds]);
  const { data = [] } = useQuery<{ target_id: string }>(
    ids.length
      ? `SELECT DISTINCT target_id FROM edges WHERE target_id IN (${ids.map(() => "?").join(",")}) AND ${REF_TYPE_SQL}`
      : "SELECT NULL AS target_id WHERE 0",
    ids,
  );

  return useMemo(() => new Set(data.map((row) => row.target_id)), [data]);
}
