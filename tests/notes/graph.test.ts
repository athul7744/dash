import { describe, expect, it } from "vitest";

import {
  buildAdjacency,
  buildGraph,
  isOrphan,
  neighborhood,
  type GraphPageInput,
  type PageEdgeRow,
} from "@/lib/notes/graph";

/**
 * Collapsing resolved edges into the undirected graph the canvas draws.
 *
 * **Ids here are uuid-shaped on purpose.** This shipped broken for months:
 * `buildGraph` keyed each pair by concatenating the two ids around a NUL byte
 * and split them apart again, and a cleanup commit that stripped "stray" NUL
 * bytes turned the split into `split("")`. Every link then pointed at a single
 * character. The suite passed anyway, because it used one-character ids — where
 * splitting `"ab"` into characters gives the right answer by accident. Real ids
 * are the only ones that prove anything here.
 */

const page = (id: string, overrides: Partial<GraphPageInput> = {}): GraphPageInput => ({
  id,
  kind: "note",
  title: id,
  emoji: null,
  tagColor: null,
  ...overrides,
});

// Two of these share a leading character, which a concatenated key must survive.
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "aaaaaaaa-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const D = "dddddddd-0000-4000-8000-000000000004";

describe("buildGraph", () => {
  it("links the two ids it was given, whole", () => {
    const { links } = buildGraph([page(A), page(B)], [{ source: A, target: B }]);
    expect(links).toEqual([{ source: A, target: B, weight: 1 }]);
  });

  it("collapses block->page edges into an undirected page graph", () => {
    const edges: PageEdgeRow[] = [
      { source: A, target: B },
      { source: B, target: C },
    ];
    const { nodes, links } = buildGraph([page(A), page(B), page(C)], edges);

    expect(nodes).toHaveLength(3);
    expect(links).toHaveLength(2);
    expect(nodes.find((n) => n.id === B)?.degree).toBe(2);
    expect(nodes.find((n) => n.id === A)?.degree).toBe(1);
  });

  it("dedupes repeated references into one weighted link", () => {
    const edges: PageEdgeRow[] = [
      { source: A, target: B },
      { source: A, target: B },
      { source: B, target: A }, // reverse direction, same pair
    ];
    const { links, nodes } = buildGraph([page(A), page(B)], edges);

    expect(links).toHaveLength(1);
    expect(links[0].weight).toBe(3);
    // undirected: each endpoint has degree 1
    expect(nodes.every((n) => n.degree === 1)).toBe(true);
  });

  it("keeps two pairs apart even when their ids share a prefix", () => {
    const { links } = buildGraph([page(A), page(B), page(C)], [
      { source: A, target: B },
      { source: A, target: C },
    ]);
    expect(links).toHaveLength(2);
    expect(new Set(links.map((l) => `${l.source}->${l.target}`)).size).toBe(2);
  });

  it("drops self-links and edges to unknown pages", () => {
    const edges: PageEdgeRow[] = [
      { source: A, target: A }, // self
      { source: A, target: "ghost" }, // unresolved target
      { source: null, target: B }, // missing source
      { source: A, target: B }, // the only real one
    ];
    const { links } = buildGraph([page(A), page(B)], edges);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ source: A, target: B, weight: 1 });
  });

  it("carries page metadata onto nodes and defaults degree to 0", () => {
    const pages = [page(A, { title: "Alpha", emoji: "🅰️", tagColor: "var(--color-sky-500)" })];
    const { nodes } = buildGraph(pages, []);

    expect(nodes[0]).toMatchObject({
      id: A,
      title: "Alpha",
      emoji: "🅰️",
      tagColor: "var(--color-sky-500)",
      degree: 0,
    });
  });
});

describe("neighborhood", () => {
  // A - B - C - D
  const links = [
    { source: A, target: B, weight: 1 },
    { source: B, target: C, weight: 1 },
    { source: C, target: D, weight: 1 },
  ];

  it("returns only the start node at depth 0", () => {
    const result = neighborhood(A, links, 0);
    expect([...result.keys()]).toEqual([A]);
    expect(result.get(A)).toBe(0);
  });

  it("walks to the requested depth with correct distances", () => {
    const d1 = neighborhood(B, links, 1);
    expect(new Set(d1.keys())).toEqual(new Set([B, A, C]));
    expect(d1.get(A)).toBe(1);

    const d2 = neighborhood(A, links, 2);
    expect(new Set(d2.keys())).toEqual(new Set([A, B, C]));
    expect(d2.get(C)).toBe(2);
  });

  it("accepts a prebuilt adjacency", () => {
    const adjacency = buildAdjacency(links);
    const result = neighborhood(D, adjacency, 3);
    expect(new Set(result.keys())).toEqual(new Set([A, B, C, D]));
  });

  it("builds adjacency both ways", () => {
    const adjacency = buildAdjacency([{ source: A, target: B, weight: 1 }]);
    expect(adjacency.get(A)?.has(B)).toBe(true);
    expect(adjacency.get(B)?.has(A)).toBe(true);
  });
});

describe("isOrphan", () => {
  it("is true only when degree is 0", () => {
    const { nodes } = buildGraph([page(A), page(B), page(C)], [{ source: A, target: B }]);
    expect(isOrphan(nodes.find((n) => n.id === C)!)).toBe(true);
    expect(isOrphan(nodes.find((n) => n.id === A)!)).toBe(false);
  });
});
