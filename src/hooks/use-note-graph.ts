"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import { useAllNotePages } from "@/hooks/use-notes";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useQuotes } from "@/hooks/use-quotes";
import { useReminders } from "@/hooks/use-reminders";
import { parseProperties, parseStoredTagIds, normalizePageEmoji } from "@/components/notes/page/utils";
import { buildGraph, type GraphNode, type NoteGraph, type PageEdgeRow } from "@/lib/notes/graph";
import { refTypeSql } from "@/lib/links/links";
import { stripRefs, REF_KIND_HUE, type RefKind } from "@/lib/links/tokens";
import type { Tag, Task } from "@/lib/powersync/AppSchema";

/** A graph node plus the id of the tag that colors it (for legend/filtering). */
export type GraphViewNode = GraphNode & { tagId: string | null };

/** All unlinked items of one kind, collapsed into a single overview cluster. */
export type GraphCluster = { kind: RefKind; count: number; nodes: GraphViewNode[] };

/** Cluster/legend ordering. */
const KIND_ORDER: RefKind[] = ["note", "task", "bookmark", "quote", "reminder"];

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
  /** The connected core: every item with at least one resolved link. */
  nodes: GraphViewNode[];
  links: NoteGraph["links"];
  /** Unlinked items, collapsed per kind (rendered as pucks, expanded on demand). */
  clusters: GraphCluster[];
  /** Tag legend for the overview (core notes). */
  tags: GraphTagLegendEntry[];
  /** Tag legend for the note cluster's items (used when drilled into it). */
  noteClusterTags: GraphTagLegendEntry[];
  isLoading: boolean;
};

/** Every reference edge, with both endpoints joined so the hook can resolve each to a node. */
const EDGE_RESOLVE_QUERY = [
  "SELECT e.source_block_id AS s_raw, e.target_id AS t_raw,",
  "  st.id AS s_task, sb.id AS s_block, sb.page_id AS s_page,",
  "  json_extract(sp.properties, '$.kind') AS s_page_kind,",
  "  tt.id AS t_task, tb.id AS t_block, tb.page_id AS t_page,",
  "  json_extract(tbp.properties, '$.kind') AS t_block_page_kind,",
  "  tp.id AS t_page_direct, json_extract(tp.properties, '$.kind') AS t_page_kind",
  "FROM edges e",
  "LEFT JOIN tasks st ON st.id = e.source_block_id",
  "LEFT JOIN blocks sb ON sb.id = e.source_block_id",
  "LEFT JOIN pages sp ON sp.id = sb.page_id",
  "LEFT JOIN tasks tt ON tt.id = e.target_id",
  "LEFT JOIN blocks tb ON tb.id = e.target_id",
  "LEFT JOIN pages tbp ON tbp.id = tb.page_id",
  "LEFT JOIN pages tp ON tp.id = e.target_id",
  `WHERE ${refTypeSql("e")}`,
].join(" ");

type EdgeResolveRow = {
  s_raw: string; t_raw: string;
  s_task: string | null; s_block: string | null; s_page: string | null; s_page_kind: string | null;
  t_task: string | null; t_block: string | null; t_page: string | null; t_block_page_kind: string | null;
  t_page_direct: string | null; t_page_kind: string | null;
};

type Endpoint = { id: string; kind: RefKind };

/** Tailwind palette name -> the CSS var Tailwind v4 exposes for shade 500. */
export function tagColorToCss(color: string | null | undefined): string | null {
  const name = (color ?? "").trim();
  return name ? `var(--color-${name}-500)` : null;
}

function resolveSource(row: EdgeResolveRow): Endpoint | null {
  if (row.s_task) return { id: row.s_raw, kind: "task" };
  if (row.s_block) {
    if (row.s_page_kind == null) return row.s_page ? { id: row.s_page, kind: "note" } : null;
    return { id: row.s_raw, kind: row.s_page_kind as RefKind };
  }
  return null;
}

function resolveTarget(row: EdgeResolveRow): Endpoint | null {
  if (row.t_task) return { id: row.t_raw, kind: "task" };
  if (row.t_page_direct && row.t_page_kind == null) return { id: row.t_raw, kind: "note" };
  if (row.t_block) {
    if (row.t_block_page_kind == null) return row.t_page ? { id: row.t_page, kind: "note" } : null;
    return { id: row.t_raw, kind: row.t_block_page_kind as RefKind };
  }
  return null;
}

/**
 * Reactive graph of the whole vault: note pages plus any task/bookmark/quote/
 * reminder that participates in a link, each its own node. `[[references]]`
 * (both legacy title links and id-bound links) become weighted undirected
 * edges. Every query is reactive, so the graph live-updates.
 */
export function useNoteGraph(): NoteGraphData {
  const { pages, isLoading: isLoadingPages } = useAllNotePages();
  const { data: edgeRows = [], isLoading: isLoadingEdges } = useQuery<EdgeResolveRow>(EDGE_RESOLVE_QUERY);
  const { data: allTags = [], isLoading: isLoadingTags } = useQuery<Tag>(
    "SELECT id, name, color FROM tags ORDER BY name ASC",
  );
  const { data: rootTasks = [] } = useQuery<Pick<Task, "id" | "title">>(
    "SELECT id, title FROM tasks WHERE parent_id IS NULL AND state != 'trashed'",
  );
  const { bookmarks } = useBookmarks();
  const { quotes } = useQuotes();
  const { reminders } = useReminders();

  return useMemo(() => {
    const tagsById = new Map(allTags.map((tag) => [tag.id, tag]));

    // Note nodes (as before): first tag colors each, else muted.
    const pageTagId = new Map<string, string | null>();
    const noteInputs = pages.map((page) => {
      const props = parseProperties(page.properties);
      const tagIds = parseStoredTagIds(props?.tags);
      const tagId = tagIds.find((id) => tagsById.has(id)) ?? null;
      pageTagId.set(page.id, tagId);
      const tag = tagId ? tagsById.get(tagId) : null;
      return {
        id: page.id,
        kind: "note" as RefKind,
        title: page.title?.trim() || "Untitled",
        emoji: normalizePageEmoji(props?.emoji),
        tagColor: tagColorToCss(tag?.color),
      };
    });

    // Every non-note entity becomes a node input (not just the linked ones), so
    // an unlinked item can surface too. Labels/colors mirror the app accents.
    const kindColor = (kind: RefKind) => tagColorToCss(REF_KIND_HUE[kind]);
    const nonNoteInputs = [
      ...rootTasks.map((t) => ({ id: t.id, kind: "task" as RefKind, title: stripRefs(t.title ?? "") || "Untitled task", emoji: null, tagColor: kindColor("task") })),
      ...bookmarks.map((b) => ({ id: b.id, kind: "bookmark" as RefKind, title: b.title || b.url || "Untitled bookmark", emoji: null, tagColor: kindColor("bookmark") })),
      ...quotes.map((q) => ({ id: q.id, kind: "quote" as RefKind, title: stripRefs(q.text || "") || "Untitled quote", emoji: null, tagColor: kindColor("quote") })),
      ...reminders.map((r) => ({ id: r.id, kind: "reminder" as RefKind, title: stripRefs(r.title || "") || "Untitled reminder", emoji: null, tagColor: kindColor("reminder") })),
    ];

    // Resolve edges to node-id pairs; keep only those between known nodes.
    const inputs = [...noteInputs, ...nonNoteInputs];
    const knownIds = new Set(inputs.map((n) => n.id));
    const pairs: PageEdgeRow[] = [];
    for (const row of edgeRows) {
      const s = resolveSource(row);
      const t = resolveTarget(row);
      if (!s || !t) continue;
      if (knownIds.has(s.id) && knownIds.has(t.id)) pairs.push({ source: s.id, target: t.id });
    }

    const { nodes, links } = buildGraph(inputs, pairs);
    const viewNodes: GraphViewNode[] = nodes.map((node) => ({
      ...node,
      tagId: node.kind === "note" ? (pageTagId.get(node.id) ?? null) : null,
    }));

    // Split: connected core (degree > 0) vs unlinked items collapsed per kind.
    // Orphans carry no edges, so `links` only ever connect core nodes.
    const core = viewNodes.filter((n) => n.degree > 0);
    const orphans = viewNodes.filter((n) => n.degree === 0);
    const clusters: GraphCluster[] = KIND_ORDER
      .map((kind) => ({ kind, nodes: orphans.filter((n) => n.kind === kind) }))
      .filter((c) => c.nodes.length > 0)
      .map((c) => ({ kind: c.kind, count: c.nodes.length, nodes: c.nodes }));

    // Legend from a set of note nodes: their tags with usage counts.
    const legendFor = (noteNodes: GraphViewNode[]): GraphTagLegendEntry[] => {
      const counts = new Map<string, number>();
      for (const n of noteNodes) if (n.kind === "note" && n.tagId) counts.set(n.tagId, (counts.get(n.tagId) ?? 0) + 1);
      return [...counts.entries()]
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
    };
    // Overview legend filters the core notes; the drill-down legend filters the
    // note cluster (the only kind that carries tags).
    const tags = legendFor(core);
    const noteClusterTags = legendFor(clusters.find((c) => c.kind === "note")?.nodes ?? []);

    return {
      nodes: core,
      links,
      clusters,
      tags,
      noteClusterTags,
      isLoading: isLoadingPages || isLoadingEdges || isLoadingTags,
    };
  }, [pages, edgeRows, allTags, rootTasks, bookmarks, quotes, reminders, isLoadingPages, isLoadingEdges, isLoadingTags]);
}
