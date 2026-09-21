"use client";

/**
 * Every tag, by name.
 *
 * Tags are a lookup table: nearly every surface that shows a tagged thing needs
 * the definitions to turn the ids in `entity_tags` into names and colours. That
 * query was written out at fourteen call sites in four different spellings —
 * with and without an `ORDER BY`, selecting `*` or three columns — which meant
 * fourteen separately watched queries over the same handful of rows, and a
 * screen whose skeleton waited on the one spelling that had been left uncached.
 *
 * One spelling, cached once. `entity_tags` holds membership; this holds only the
 * definitions.
 */

import { useCachedQuery } from "@/hooks/use-cached-query";
import type { Tag } from "@/lib/powersync/AppSchema";

/** A tag row as every consumer uses it — the id is always present. */
export type TagRow = Tag & { id: string };

const ALL_TAGS = "SELECT id, name, color FROM tags ORDER BY name ASC";

export function useAllTags(): { tags: TagRow[]; isLoading: boolean } {
  const { data, isLoading } = useCachedQuery<TagRow>(ALL_TAGS);
  return { tags: data, isLoading };
}
