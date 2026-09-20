/**
 * Pure, React-free helpers for the notes graph view.
 *
 * The database stores links as block -> page `edges` rows (`type = 'page_ref'`).
 * `buildGraph` collapses those to an undirected page -> page graph (deduped,
 * self-links dropped, repeated links weighted). `neighborhood` walks that graph
 * to a given depth for the hover highlight and the details-rail local graph.
 *
 * Kept side-effect free so it can be unit tested without PowerSync or a DOM.
 */

import type { RefKind } from "@/lib/links/tokens";

/** A node as the graph cares about it (shape produced by the hook). */
export type GraphPageInput = {
  id: string;
  kind: RefKind;
  title: string;
  emoji: string | null;
  /** CSS color for the node fill (page tag, or the app accent for other kinds). */
  tagColor: string | null;
};

/** A resolved entity -> entity edge (both endpoints are node ids). */
export type PageEdgeRow = {
  source: string | null;
  target: string | null;
};

export type GraphNode = {
  id: string;
  kind: RefKind;
  title: string;
  emoji: string | null;
  tagColor: string | null;
  /** Number of distinct nodes this one is linked to (undirected). */
  degree: number;
};

export type GraphLink = {
  source: string;
  target: string;
  /** How many block-level references collapsed into this page pair. */
  weight: number;
};

export type NoteGraph = {
  nodes: GraphNode[];
  links: GraphLink[];
};

/**
 * Collapse block->page edge rows into an undirected, deduped page->page graph.
 * Only pages present in `pages` become nodes; edges touching an unknown page
 * (e.g. an unresolved link) or a self-link are dropped.
 *
 * Pairs are held in a nested map rather than under a concatenated key, so the
 * two ids are never packed into one string and pulled apart again. The version
 * that did was broken by a commit stripping the NUL bytes it used as the
 * separator: every link then pointed at a single character, no node reached
 * degree 1, and the whole vault rendered as orphan clusters.
 */
export function buildGraph(pages: GraphPageInput[], edgeRows: PageEdgeRow[]): NoteGraph {
  const known = new Set(pages.map((p) => p.id));
  /** lower id -> higher id -> the link, so each unordered pair is held once. */
  const pairs = new Map<string, Map<string, GraphLink>>();

  for (const row of edgeRows) {
    const { source, target } = row;
    if (!source || !target || source === target) continue;
    if (!known.has(source) || !known.has(target)) continue;
    const [lo, hi] = source < target ? [source, target] : [target, source];
    let byTarget = pairs.get(lo);
    if (!byTarget) {
      byTarget = new Map();
      pairs.set(lo, byTarget);
    }
    const existing = byTarget.get(hi);
    if (existing) existing.weight += 1;
    else byTarget.set(hi, { source: lo, target: hi, weight: 1 });
  }

  const links = [...pairs.values()].flatMap((byTarget) => [...byTarget.values()]);
  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    emoji: p.emoji,
    tagColor: p.tagColor,
    degree: degree.get(p.id) ?? 0,
  }));

  return { nodes, links };
}

/** Undirected adjacency list keyed by node id. */
export function buildAdjacency(links: GraphLink[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    let set = adjacency.get(from);
    if (!set) {
      set = new Set<string>();
      adjacency.set(from, set);
    }
    set.add(to);
  };
  for (const link of links) {
    add(link.source, link.target);
    add(link.target, link.source);
  }
  return adjacency;
}

/**
 * Breadth-first walk from `startId` out to `depth` hops. Returns a map of
 * reachable node id -> distance (the start node is distance 0). `depth <= 0`
 * yields just the start node. Accepts a prebuilt adjacency to avoid rebuilding
 * it on every hover.
 */
export function neighborhood(
  startId: string,
  linksOrAdjacency: GraphLink[] | Map<string, Set<string>>,
  depth: number,
): Map<string, number> {
  const adjacency = Array.isArray(linksOrAdjacency)
    ? buildAdjacency(linksOrAdjacency)
    : linksOrAdjacency;

  const distances = new Map<string, number>([[startId, 0]]);
  let frontier = [startId];
  for (let d = 0; d < Math.max(0, depth); d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, d + 1);
          next.push(neighbor);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return distances;
}

/** A page with no links to any other page. */
export function isOrphan(node: GraphNode): boolean {
  return node.degree === 0;
}
