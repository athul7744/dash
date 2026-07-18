"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { GraphLink } from "@/lib/notes/graph";
import type { GraphViewNode } from "@/hooks/use-note-graph";

export type SimNode = SimulationNodeDatum & GraphViewNode;
export type SimLink = SimulationLinkDatum<SimNode> & { weight: number };

/** Node radius as a function of connection count — hubs read larger. */
export function nodeRadius(degree: number): number {
  return 6 + Math.min(degree, 10) * 2.1;
}

type Size = { width: number; height: number };

export type ForceSimulation = {
  /** Simulation nodes; positions are mutated in place by d3 every tick. */
  nodes: SimNode[];
  /** Simulation links; source/target become node refs once the sim starts. */
  links: SimLink[];
  onDragStart: () => void;
  onDrag: (node: SimNode, x: number, y: number) => void;
  onDragEnd: () => void;
  /** Clear a pinned node so the forces reclaim it (double-click). */
  unpin: (node: SimNode) => void;
};

/** Order-independent identity of the node set. */
function nodesKey(nodes: GraphViewNode[]): string {
  return nodes.map((n) => n.id).sort().join(",");
}

/** Order-independent identity of the link set (pair + weight). */
function linksKey(links: GraphLink[]): string {
  return links.map((l) => `${l.source}~${l.target}~${l.weight}`).sort().join(",");
}

/**
 * Wraps d3-force. The mutable node/link objects are created in a memo (stable
 * until the graph shape or canvas size changes) so d3 can mutate positions in
 * place; a `tick` state bump drives React repaints and stops when the layout
 * settles. Rendering reads the memoized arrays directly — no refs touched
 * during render, no synchronous setState inside the effect.
 */
// Ticks to run synchronously for a settled static layout (d3's default cooling
// reaches alphaMin in ~300 ticks). Cheap thanks to d3's quadtree forces.
const SETTLE_TICKS = 300;

export function useForceSimulation(
  inputNodes: GraphViewNode[],
  inputLinks: GraphLink[],
  size: Size,
): ForceSimulation {
  const [, setTick] = useState(0);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const rafRef = useRef<number | null>(null);

  const key = `${nodesKey(inputNodes)}|${linksKey(inputLinks)}|${size.width}x${size.height}`;

  const { nodes, links } = useMemo(() => {
    const width = size.width || 800;
    const height = size.height || 600;
    const nodes: SimNode[] = inputNodes.map((node, index) => {
      const angle = (index / Math.max(1, inputNodes.length)) * Math.PI * 2;
      return { ...node, x: width / 2 + Math.cos(angle) * 90, y: height / 2 + Math.sin(angle) * 90 };
    });
    const links: SimLink[] = inputLinks.map((link) => ({ ...link }));
    return { nodes, links };
    // Rebuild only when the graph shape or size changes; a reactive refresh
    // that returns the same graph keeps the same objects (positions persist).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;

    const cx = size.width / 2;
    const cy = size.height / 2;
    const simulation = forceSimulation<SimNode>(nodes)
      // Cap the repulsion range so distant (especially unconnected) nodes stop
      // pushing each other to the far corners.
      .force("charge", forceManyBody<SimNode>().strength(-170).distanceMax(280))
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((node) => node.id)
          .distance((link) => 46 + link.weight * 5)
          .strength(0.5),
      )
      .force("center", forceCenter(cx, cy).strength(0.05))
      // Gravity toward the centre keeps the whole cloud — and orphan nodes with
      // no links to hold them in — gathered instead of drifting outward.
      .force("x", forceX<SimNode>(cx).strength(0.09))
      .force("y", forceY<SimNode>(cy).strength(0.09))
      .force("collide", forceCollide<SimNode>().radius((node) => nodeRadius(node.degree) + 6))
      .velocityDecay(0.35)
      .on("tick", () => {
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            setTick((value) => value + 1);
          });
        }
      });

    // Relax the layout synchronously so it paints already-settled (and can be
    // framed immediately) instead of visibly expanding over ~2s. Drag/hover
    // reheats it via alphaTarget().restart() on demand.
    simulation.stop();
    simulation.tick(SETTLE_TICKS);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setTick((value) => value + 1);
    });

    simRef.current = simulation;

    return () => {
      simulation.stop();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [nodes, links, size.width, size.height]);

  return {
    nodes,
    links,
    onDragStart: () => {
      simRef.current?.alphaTarget(0.3).restart();
    },
    onDrag: (node, x, y) => {
      node.fx = x;
      node.fy = y;
    },
    onDragEnd: () => {
      simRef.current?.alphaTarget(0);
    },
    unpin: (node) => {
      node.fx = null;
      node.fy = null;
      simRef.current?.alpha(0.3).restart();
    },
  };
}
