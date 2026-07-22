import { describe, expect, it } from "vitest";

import {
  buildAdjacency,
  buildGraph,
  isOrphan,
  neighborhood,
  type GraphPageInput,
  type PageEdgeRow,
} from "@/lib/notes/graph";

const page = (id: string, overrides: Partial<GraphPageInput> = {}): GraphPageInput => ({
  id,
  kind: "note",
  title: id.toUpperCase(),
  emoji: null,
  tagColor: null,
  ...overrides,
});

describe("buildGraph", () => {
  it("collapses block->page edges into an undirected page graph", () => {
    const pages = [page("a"), page("b"), page("c")];
    const edges: PageEdgeRow[] = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];
    const { nodes, links } = buildGraph(pages, edges);

    expect(nodes).toHaveLength(3);
    expect(links).toHaveLength(2);
    expect(nodes.find((n) => n.id === "b")?.degree).toBe(2);
    expect(nodes.find((n) => n.id === "a")?.degree).toBe(1);
  });

  it("dedupes repeated references into one weighted link", () => {
    const pages = [page("a"), page("b")];
    const edges: PageEdgeRow[] = [
      { source: "a", target: "b" },
      { source: "a", target: "b" },
      { source: "b", target: "a" }, // reverse direction, same pair
    ];
    const { links, nodes } = buildGraph(pages, edges);

    expect(links).toHaveLength(1);
    expect(links[0].weight).toBe(3);
    // undirected: each endpoint has degree 1
    expect(nodes.every((n) => n.degree === 1)).toBe(true);
  });

  it("drops self-links and edges to unknown pages", () => {
    const pages = [page("a"), page("b")];
    const edges: PageEdgeRow[] = [
      { source: "a", target: "a" }, // self
      { source: "a", target: "ghost" }, // unresolved target
      { source: null, target: "b" }, // missing source
      { source: "a", target: "b" }, // the only real one
    ];
    const { links } = buildGraph(pages, edges);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ source: "a", target: "b", weight: 1 });
  });

  it("carries page metadata onto nodes and defaults degree to 0", () => {
    const pages = [page("a", { title: "Alpha", emoji: "🅰️", tagColor: "var(--color-sky-500)" })];
    const { nodes } = buildGraph(pages, []);

    expect(nodes[0]).toMatchObject({
      id: "a",
      title: "Alpha",
      emoji: "🅰️",
      tagColor: "var(--color-sky-500)",
      degree: 0,
    });
  });
});

describe("neighborhood", () => {
  // a - b - c - d ,  plus isolated e
  const links = [
    { source: "a", target: "b", weight: 1 },
    { source: "b", target: "c", weight: 1 },
    { source: "c", target: "d", weight: 1 },
  ];

  it("returns only the start node at depth 0", () => {
    const result = neighborhood("a", links, 0);
    expect([...result.keys()]).toEqual(["a"]);
    expect(result.get("a")).toBe(0);
  });

  it("walks to the requested depth with correct distances", () => {
    const d1 = neighborhood("b", links, 1);
    expect(new Set(d1.keys())).toEqual(new Set(["b", "a", "c"]));
    expect(d1.get("a")).toBe(1);

    const d2 = neighborhood("a", links, 2);
    expect(new Set(d2.keys())).toEqual(new Set(["a", "b", "c"]));
    expect(d2.get("c")).toBe(2);
  });

  it("accepts a prebuilt adjacency", () => {
    const adjacency = buildAdjacency(links);
    const result = neighborhood("d", adjacency, 3);
    expect(new Set(result.keys())).toEqual(new Set(["a", "b", "c", "d"]));
  });
});

describe("isOrphan", () => {
  it("is true only when degree is 0", () => {
    const { nodes } = buildGraph([page("a"), page("b"), page("lonely")], [
      { source: "a", target: "b" },
    ]);
    expect(isOrphan(nodes.find((n) => n.id === "lonely")!)).toBe(true);
    expect(isOrphan(nodes.find((n) => n.id === "a")!)).toBe(false);
  });
});
