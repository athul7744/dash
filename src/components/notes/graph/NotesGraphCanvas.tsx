"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

import { buildAdjacency, neighborhood, type GraphLink } from "@/lib/notes/graph";
import type { GraphViewNode } from "@/hooks/use-note-graph";
import type { RefKind } from "@/lib/links/tokens";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";
import { nodeRadius, useForceSimulation, type SimLink, type SimNode } from "./useForceSimulation";

type Transform = { x: number; y: number; k: number };

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const CLICK_SLOP = 4; // px of movement below which a pointer-up counts as a click
// The local "Connections" panel has too few nodes for degree-sizing to mean
// anything, so it uses one uniform radius; the full vault graph keeps hubs big.
const MINI_NODE_RADIUS = 9;

const endId = (end: SimLink["source"]): string =>
  typeof end === "object" && end != null ? (end as SimNode).id : String(end);

/** The entity's Lucide icon, in its accent colour, centered inside a node. */
function KindGlyph({ kind, r, color }: { kind: RefKind; r: number; color: string }) {
  const Icon = getApp(`${kind}s`).icon;
  const size = r * 1.15;
  return (
    <Icon
      x={-size / 2}
      y={-size / 2}
      size={size}
      color={color}
      strokeWidth={2.4}
      style={{ pointerEvents: "none" }}
    />
  );
}

export function NotesGraphCanvas({
  nodes,
  links,
  size,
  selectedId,
  onSelect,
  depth = 1,
  searchQuery = "",
  variant = "full",
}: {
  nodes: GraphViewNode[];
  links: GraphLink[];
  size: { width: number; height: number };
  selectedId: string | null;
  onSelect: (id: string, kind: RefKind) => void;
  depth?: number;
  searchQuery?: string;
  variant?: "full" | "mini";
}) {
  const sim = useForceSimulation(nodes, links, size);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const userMovedRef = useRef(false);
  const markMoved = () => {
    userMovedRef.current = true;
  };

  // Calm entrance: the pre-settled layout is there instantly, so fade + a hair
  // of scale in rather than snapping into view.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const adjacency = useMemo(() => buildAdjacency(links), [links]);
  // Display metadata (color/emoji/title) read fresh from props by id, so tags
  // that resolve after the layout is built still recolor the nodes in place.
  const metaById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const key = useMemo(() => nodes.map((node) => node.id).sort().join(","), [nodes]);

  // Which nodes are emphasised: a hovered node's neighbourhood, else pages
  // matching the search box. Null means "no emphasis" (nothing dimmed).
  const highlight = useMemo(() => {
    if (hoverId) return new Set(neighborhood(hoverId, adjacency, depth).keys());
    const query = searchQuery.trim().toLowerCase();
    if (query) return new Set(nodes.filter((n) => n.title.toLowerCase().includes(query)).map((n) => n.id));
    return null;
  }, [hoverId, searchQuery, depth, adjacency, nodes]);
  const dimming = highlight != null;

  const toGraph = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (clientX - rect.left - transform.x) / transform.k, y: (clientY - rect.top - transform.y) / transform.k };
    },
    [transform],
  );

  const zoomAround = useCallback((px: number, py: number, factor: number) => {
    setTransform((t) => {
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k * factor));
      return { k, x: px - (px - t.x) * (k / t.k), y: py - (py - t.y) * (k / t.k) };
    });
  }, []);

  const fitView = useCallback(() => {
    const placed = sim.nodes.filter((n) => n.x != null && n.y != null);
    if (placed.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of placed) {
      const r = nodeRadius(n.degree) + 34;
      minX = Math.min(minX, n.x! - r); minY = Math.min(minY, n.y! - r);
      maxX = Math.max(maxX, n.x! + r); maxY = Math.max(maxY, n.y! + r);
    }
    const gw = maxX - minX, gh = maxY - minY;
    const k = Math.max(MIN_ZOOM, Math.min(variant === "mini" ? 1.4 : 2, Math.min(size.width / gw, size.height / gh)));
    setTransform({ k, x: (size.width - gw * k) / 2 - minX * k, y: (size.height - gh * k) / 2 - minY * k });
  }, [sim.nodes, size.width, size.height, variant]);

  // Frame the graph once per node set — on the next frame after the (already
  // settled) layout mounts, and only if the user hasn't panned/zoomed/dragged.
  const fittedKeyRef = useRef<string>("");
  const fitOnce = useCallback(() => {
    if (userMovedRef.current || fittedKeyRef.current === key || size.width === 0) return;
    fittedKeyRef.current = key;
    fitView();
  }, [key, fitView, size.width]);
  // A fresh node set may re-frame; forget the previous manual adjustments.
  useEffect(() => {
    userMovedRef.current = false;
  }, [key]);
  useEffect(() => {
    if (nodes.length === 0 || size.width === 0) return;
    const raf = requestAnimationFrame(() => fitOnce());
    return () => cancelAnimationFrame(raf);
  }, [key, size.width, nodes.length, fitOnce]);

  // ── Pan (background drag) + wheel zoom ───────────────────────────────────
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    if ((event.target as Element).closest("[data-node]")) return;
    markMoved();
    panRef.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
    svgRef.current?.setPointerCapture(event.pointerId);
  };
  const onBackgroundPointerMove = (event: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    setTransform((t) => ({ ...t, x: pan.tx + (event.clientX - pan.x), y: pan.ty + (event.clientY - pan.y) }));
  };
  const onBackgroundPointerUp = () => {
    panRef.current = null;
  };
  const onWheel = (event: React.WheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    markMoved();
    zoomAround(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.12 : 0.89);
  };

  // ── Node drag / click / hover ────────────────────────────────────────────
  const dragRef = useRef<{ node: SimNode; startX: number; startY: number; moved: boolean } | null>(null);
  const onNodePointerDown = (event: React.PointerEvent, node: SimNode) => {
    event.stopPropagation();
    dragRef.current = { node, startX: event.clientX, startY: event.clientY, moved: false };
    const p = toGraph(event.clientX, event.clientY);
    sim.onDragStart();
    sim.onDrag(node, p.x, p.y);
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };
  const onNodePointerMove = (event: React.PointerEvent, node: SimNode) => {
    const drag = dragRef.current;
    if (!drag || drag.node !== node) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > CLICK_SLOP) {
      drag.moved = true;
      markMoved();
    }
    const p = toGraph(event.clientX, event.clientY);
    sim.onDrag(node, p.x, p.y);
  };
  const onNodePointerUp = (node: SimNode) => {
    const drag = dragRef.current;
    sim.onDragEnd();
    if (drag && drag.node === node && !drag.moved) onSelect(node.id, metaById.get(node.id)?.kind ?? "note");
    dragRef.current = null;
  };

  const showLabel = (node: SimNode, faded: boolean) => {
    if (variant === "mini") return true;
    if (faded) return false;
    return (
      node.id === selectedId ||
      node.id === hoverId ||
      (dimming && highlight!.has(node.id)) ||
      node.degree >= 3 ||
      transform.k >= 1.3
    );
  };

  return (
    <div className="relative h-full w-full">
      <div
        className={cn(
          "h-full w-full transition-[opacity,transform] duration-500 ease-out will-change-transform motion-reduce:!transition-none motion-reduce:!duration-0",
          entered ? "scale-100 opacity-100" : "scale-[0.985] opacity-0",
        )}
      >
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className="block h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onBackgroundPointerMove}
        onPointerUp={onBackgroundPointerUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          <g>
            {sim.links.map((link, index) => {
              const s = link.source as SimNode;
              const t = link.target as SimNode;
              if (typeof s !== "object" || typeof t !== "object") return null;
              const on = dimming && highlight!.has(endId(link.source)) && highlight!.has(endId(link.target));
              return (
                <line
                  key={index}
                  x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={on ? "var(--primary)" : "var(--border)"}
                  strokeWidth={on ? 1.8 : 1.2}
                  strokeOpacity={dimming && !on ? 0.25 : 1}
                />
              );
            })}
          </g>
          <g>
            {sim.nodes.map((node) => {
              const meta = metaById.get(node.id) ?? node;
              const faded = dimming && !highlight!.has(node.id);
              const r = variant === "mini" ? MINI_NODE_RADIUS : nodeRadius(node.degree);
              const selected = node.id === selectedId;
              return (
                <g
                  key={node.id}
                  data-node
                  transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                  className="cursor-pointer"
                  style={{ opacity: faded ? 0.2 : 1, transition: "opacity .18s" }}
                  onPointerDown={(e) => onNodePointerDown(e, node)}
                  onPointerMove={(e) => onNodePointerMove(e, node)}
                  onPointerUp={() => onNodePointerUp(node)}
                  onDoubleClick={() => sim.unpin(node)}
                  onPointerEnter={() => setHoverId(node.id)}
                  onPointerLeave={() => setHoverId((current) => (current === node.id ? null : current))}
                >
                  <circle
                    r={r}
                    fill="var(--background)"
                    stroke={selected ? "var(--color-muted-foreground)" : "var(--border)"}
                    strokeWidth={1.5}
                  />
                  {r >= 6 ? (
                    meta.kind === "note" && meta.emoji ? (
                      <text textAnchor="middle" dominantBaseline="central" fontSize={r} style={{ pointerEvents: "none" }}>
                        {meta.emoji}
                      </text>
                    ) : (
                      <KindGlyph kind={meta.kind} r={r} color={meta.tagColor ?? "var(--color-muted-foreground)"} />
                    )
                  ) : null}
                  {showLabel(node, faded) ? (
                    <text
                      y={r + 11}
                      textAnchor="middle"
                      fontSize={variant === "mini" ? 9.5 : 11}
                      fontWeight={600}
                      fill="var(--foreground)"
                      style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3, strokeLinejoin: "round" }}
                    >
                      {meta.title.length > 22 ? `${meta.title.slice(0, 21)}…` : meta.title}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      </div>

      {variant === "full" ? (
        <div className="absolute bottom-1 right-4 z-50 flex flex-col gap-1 rounded-xl border border-border/60 bg-popover/90 p-1 shadow-lg backdrop-blur-sm sm:bottom-4">
          <button type="button" aria-label="Zoom in" onClick={() => zoomAround(size.width / 2, size.height / 2, 1.2)} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomAround(size.width / 2, size.height / 2, 0.83)} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Zoom to fit" onClick={fitView} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
