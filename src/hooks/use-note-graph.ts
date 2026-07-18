"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import { useAllNotePages } from "@/hooks/use-notes";
import { parseProperties, parseStoredTagIds, normalizePageEmoji } from "@/components/notes/page/utils";
import { buildGraph, type GraphNode, type NoteGraph, type PageEdgeRow } from "@/lib/notes/graph";
import type { Tag } from "@/lib/powersync/AppSchema";

/** A graph node plus the id of the tag that colors it (for legend/filtering). */
export type GraphViewNode = GraphNode & { tagId: string | null };

/** One entry in the tag legend / filter, with how many pages carry it. */
export type GraphTagLegendEntry = {
  id: string;
  name: string;
  /** Tailwind color name as stored on the tag (e.g. "amber"). */
  color: string;
  /** Resolved CSS color for swatches/fills. */
  cssColor: string;
  count: number;
};

export type NoteGraphData = {
  nodes: GraphViewNode[];
  links: NoteGraph["links"];
  tags: GraphTagLegendEntry[];
  isLoading: boolean;
};

// Collapse block->page reference edges to a page->page list. Weighting +
// dedup happen in `buildGraph`.
const PAGE_EDGES_QUERY = [
  "SELECT b.page_id AS source_page_id, e.target_id AS target_id",
  "FROM edges e",
  "JOIN blocks b ON b.id = e.source_block_id",
  "WHERE e.type = 'page_ref'",
].join(" ");

/** Tailwind palette name -> the CSS var Tailwind v4 exposes for shade 500. */
export function tagColorToCss(color: string | null | undefined): string | null {
  const name = (color ?? "").trim();
  return name ? `var(--color-${name}-500)` : null;
}

/**
 * Reactive graph model for the notes vault: pages become nodes, resolved
 * `[[wikilink]]` references become weighted undirected links. Both underlying
 * queries are reactive, so the graph live-updates as the vault changes.
 */
export function useNoteGraph(): NoteGraphData {
  const { pages, isLoading: isLoadingPages } = useAllNotePages();
  const { data: edgeRows = [], isLoading: isLoadingEdges } = useQuery<PageEdgeRow>(PAGE_EDGES_QUERY);
  const { data: allTags = [], isLoading: isLoadingTags } = useQuery<Tag>(
    "SELECT id, name, color FROM tags ORDER BY name ASC",
  );

  return useMemo(() => {
    const tagsById = new Map(allTags.map((tag) => [tag.id, tag]));

    // First tag id per page (the page's coloring tag), plus its resolved color.
    const pageTagId = new Map<string, string | null>();
    const inputs = pages.map((page) => {
      const props = parseProperties(page.properties);
      const tagIds = parseStoredTagIds(props?.tags);
      const tagId = tagIds.find((id) => tagsById.has(id)) ?? null;
      pageTagId.set(page.id, tagId);
      const tag = tagId ? tagsById.get(tagId) : null;
      return {
        id: page.id,
        title: page.title?.trim() || "Untitled",
        emoji: normalizePageEmoji(props?.emoji),
        tagColor: tagColorToCss(tag?.color),
      };
    });

    const { nodes, links } = buildGraph(inputs, edgeRows);
    const viewNodes: GraphViewNode[] = nodes.map((node) => ({
      ...node,
      tagId: pageTagId.get(node.id) ?? null,
    }));

    // Legend: only tags actually used by a page, with usage counts.
    const counts = new Map<string, number>();
    for (const tagId of pageTagId.values()) {
      if (tagId) counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
    const tags: GraphTagLegendEntry[] = [...counts.entries()]
      .map(([id, count]) => {
        const tag = tagsById.get(id);
        return {
          id,
          name: tag?.name?.trim() || "Tag",
          color: tag?.color || "slate",
          cssColor: tagColorToCss(tag?.color) ?? "var(--color-muted-foreground)",
          count,
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return {
      nodes: viewNodes,
      links,
      tags,
      isLoading: isLoadingPages || isLoadingEdges || isLoadingTags,
    };
  }, [pages, edgeRows, allTags, isLoadingPages, isLoadingEdges, isLoadingTags]);
}
