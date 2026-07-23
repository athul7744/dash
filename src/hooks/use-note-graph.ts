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

    // Label lookups for the non-note kinds.
    const labelFor = (kind: RefKind, id: string): string | null => {
      switch (kind) {
        case "task": { const t = rootTasks.find((x) => x.id === id); return t ? (stripRefs(t.title ?? "") || "Untitled task") : null; }
        case "bookmark": { const b = bookmarks.find((x) => x.id === id); return b ? (b.title || b.url || "Untitled bookmark") : null; }
        case "quote": { const q = quotes.find((x) => x.id === id); return q ? (stripRefs(q.text || "") || "Untitled quote") : null; }
        case "reminder": { const r = reminders.find((x) => x.id === id); return r ? (stripRefs(r.title || "") || "Untitled reminder") : null; }
        default: return null;
      }
    };

    // Resolve every edge; collect the non-note nodes that appear and the edge pairs.
    const nonNote = new Map<string, { kind: RefKind; label: string }>();
    const noteIds = new Set(noteInputs.map((n) => n.id));
    const pairs: PageEdgeRow[] = [];

    for (const row of edgeRows) {
      const s = resolveSource(row);
      const t = resolveTarget(row);
      if (!s || !t) continue;

      for (const end of [s, t]) {
        if (end.kind === "note") continue;
        if (nonNote.has(end.id)) continue;
        const label = labelFor(end.kind, end.id);
        if (label != null) nonNote.set(end.id, { kind: end.kind, label });
      }

      const exists = (end: Endpoint) => (end.kind === "note" ? noteIds.has(end.id) : nonNote.has(end.id));
      if (exists(s) && exists(t)) pairs.push({ source: s.id, target: t.id });
    }

    const nonNoteInputs = [...nonNote.entries()].map(([id, { kind, label }]) => ({
      id,
      kind,
      title: label,
      emoji: null,
      tagColor: tagColorToCss(REF_KIND_HUE[kind]),
    }));

    const { nodes, links } = buildGraph([...noteInputs, ...nonNoteInputs], pairs);
    const viewNodes: GraphViewNode[] = nodes.map((node) => ({
      ...node,
      tagId: node.kind === "note" ? (pageTagId.get(node.id) ?? null) : null,
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
  }, [pages, edgeRows, allTags, rootTasks, bookmarks, quotes, reminders, isLoadingPages, isLoadingEdges, isLoadingTags]);
}
