"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

/**
 * Live tag ids for a set of entities, keyed by entity id. Batched — call it once
 * per list with all visible ids rather than once per card. Returns a Map; a
 * missing entity means no tags.
 */
export function useEntityTags(entityIds: string[]): Map<string, string[]> {
  // Stabilize on the sorted distinct id set so the query doesn't re-run when the
  // caller passes a new array with the same members.
  const key = useMemo(
    () => Array.from(new Set(entityIds.filter(Boolean))).sort().join(","),
    [entityIds],
  );
  const ids = useMemo(() => (key ? key.split(",") : []), [key]);

  const { data = [] } = useQuery<{ entity_id: string; tag_id: string }>(
    ids.length
      ? `SELECT entity_id, tag_id FROM entity_tags WHERE entity_id IN (${ids.map(() => "?").join(",")})`
      : "SELECT NULL AS entity_id, NULL AS tag_id WHERE 0",
    ids,
  );

  return useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of data) {
      if (!r.entity_id || !r.tag_id) continue;
      const arr = map.get(r.entity_id);
      if (arr) arr.push(r.tag_id);
      else map.set(r.entity_id, [r.tag_id]);
    }
    return map;
  }, [data]);
}

export type EntityByTag = { entity_id: string; entity_kind: string };

/** Every entity carrying a tag, across all apps — the cross-app "under a tag" view. */
export function useEntitiesByTag(tagId: string | null): EntityByTag[] {
  const { data = [] } = useQuery<EntityByTag>(
    tagId
      ? "SELECT entity_id, entity_kind FROM entity_tags WHERE tag_id = ?"
      : "SELECT NULL AS entity_id, NULL AS entity_kind WHERE 0",
    tagId ? [tagId] : [],
  );
  return data;
}
