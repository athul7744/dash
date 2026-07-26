"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

import { buildAdjacency, neighborhood, type GraphLink } from "@/lib/notes/graph";
import type { GraphCluster, GraphViewNode } from "@/hooks/use-note-graph";
import { REF_KIND_LABEL, refKindAccentVar, type RefKind } from "@/lib/links/tokens";
import { isEmoji } from "@/components/notes/SpriteIcon";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";
import { nodeRadius, useForceSimulation, type SimLink, type SimNode } from "./useForceSimulation";

type Transform = { x: number; y: number; k: number };

// Effectively no minimum — just a tiny epsilon so the scale can't hit 0 — so a
// large graph can zoom all the way out until every element fits the viewport.
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const CLICK_SLOP = 4; // px of movement below which a pointer-up counts as a click
// The local "Connections" panel has too few nodes for degree-sizing to mean
// anything, so it uses one uniform radius; the full vault graph keeps hubs big.
const MINI_NODE_RADIUS = 9;
// Uniform radius for an expanded cluster's items (they have no degree to size by).
const CLUSTER_NODE_RADIUS = 13;

const endId = (end: SimLink["source"]): string =>
  typeof end === "object" && end != null ? (end as SimNode).id : String(end);

// A puck shows the item count as a field of small dots rather than a number.
// Dots map 1:1 with items up to a cap; past it the disc simply reads "full"
// (it's already at max size and density), so 60 vs 600 both look like a lot
// without rendering hundreds of circles or needing a label. Size still scales
// (sub-linearly) with count so smaller clusters stay visibly smaller.
const PUCK_DOT_CAP = 50;
const PUCK_MIN_R = 20;
const PUCK_MAX_R = 46;
/** Puck disc radius — grows sub-linearly with count, capped. */
const puckRadius = (count: number): number => Math.min(PUCK_MAX_R, PUCK_MIN_R + Math.sqrt(count) * 3.0);
/** Radius the expanded items spread over (for framing the camera). */
const clusterSpread = (count: number): number => 26 * Math.sqrt(Math.max(1, count));

/**
 * Positions of the small dots packed inside a puck of radius `R`. A sunflower
 * (phyllotaxis) layout gives even, tight packing; the dot radius tracks the
 * nearest-neighbour spacing so dots sit close without overlapping at any count.
 */
function puckDots(count: number, R: number): { x: number; y: number; r: number }[] {
  const usable = R - 6;
  const n = Math.min(count, PUCK_DOT_CAP);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const dotR = Math.max(1.6, Math.min(4.2, (usable / Math.sqrt(Math.max(1, n))) * 0.62));
  const dots: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const rad = usable * Math.sqrt((i + 0.5) / n);
    const ang = i * golden;
    dots.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, r: dotR });
  }
  return dots;
}

/**
 * The glyph centered inside a node. A note with a custom icon shows it: a
 * stored "emoji" is either a Unicode emoji (render as text) or a Fluent-emoji
 * sprite name (render the sprite) — the same split `SpriteIcon` makes; printing
 * the raw string as text showed sprite names like "airplane" instead of the
 * icon. Everything else falls back to the entity's Lucide icon in its accent.
 */
function NodeIcon({ meta, r }: { meta: GraphViewNode; r: number }) {
  if (meta.kind === "note" && meta.emoji) {
    if (isEmoji(meta.emoji)) {
      return (
        <text textAnchor="middle" dominantBaseline="central" fontSize={r} style={{ pointerEvents: "none" }}>
          {meta.emoji}
        </text>
      );
    }
    const s = r * 1.5;
    return (
      <svg x={-s / 2} y={-s / 2} width={s} height={s} viewBox="0 0 32 32" style={{ pointerEvents: "none" }}>
        <use href={`/icons/fluent-emoji.svg#${meta.emoji}`} />
      </svg>
    );
  }
  const Icon = getApp(`${meta.kind}s`).icon;
  const size = r * 1.15;
  return (
    <Icon
      x={-size / 2}
      y={-size / 2}
      size={size}
      color={meta.tagColor ?? "var(--color-muted-foreground)"}
      strokeWidth={2.4}
      style={{ pointerEvents: "none" }}
    />
  );
}

export function NotesGraphCanvas({
  nodes,
  links,
  clusters = [],
  focusKind = null,
  onExpandCluster,
  onCollapse,
  size,
  selectedId,
  onSelect,
  depth = 1,
  searchQuery = "",
  variant = "full",
}: {
  nodes: GraphViewNode[];
  links: GraphLink[];
  /** Collapsed per-kind orphan clusters (full variant only). */
  clusters?: GraphCluster[];
  /** Which cluster is expanded, or null for the overview. */
  focusKind?: RefKind | null;
  onExpandCluster?: (kind: RefKind) => void;
  onCollapse?: () => void;
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

  // Keep a ref in sync so the camera tween can read the live transform.
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const focused = focusKind != null;

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
  // Include clusters so the auto-fit re-runs when orphan clusters finish loading
  // (they arrive after the connected core); otherwise late pucks sit off-screen.
  const key = useMemo(
    () => [...nodes.map((n) => n.id), ...clusters.map((c) => `${c.kind}:${c.count}`)].sort().join(","),
    [nodes, clusters],
  );

  // Cluster pucks: one disc per kind, placed on a ring around the core centre.
  const puckLayout = useMemo(() => {
    const map = new Map<RefKind, { x: number; y: number; r: number; count: number }>();
    const cx = size.width / 2;
    const cy = size.height / 2;
    const R = Math.min(size.width, size.height) * 0.42;
    clusters.forEach((c, i) => {
      const a = -Math.PI / 2 + (i / Math.max(1, clusters.length)) * Math.PI * 2;
      map.set(c.kind, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, r: puckRadius(c.count), count: c.count });
    });
    return map;
  }, [clusters, size.width, size.height]);

  // Deterministic sunflower packing of the focused cluster's items around its puck.
  const focusPositions = useMemo(() => {
    if (!focusKind) return [] as { node: GraphViewNode; x: number; y: number }[];
    const p = puckLayout.get(focusKind);
    const cluster = clusters.find((c) => c.kind === focusKind);
    if (!p || !cluster) return [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    const spacing = 26;
    return cluster.nodes.map((node, i) => ({
      node,
      x: p.x + spacing * Math.sqrt(i + 0.5) * Math.cos(i * golden),
      y: p.y + spacing * Math.sqrt(i + 0.5) * Math.sin(i * golden),
    }));
  }, [focusKind, puckLayout, clusters]);

  // Which nodes are emphasised: a hovered node's neighbourhood, else pages
  // matching the search box. Null means "no emphasis" (nothing dimmed).
  const highlight = useMemo(() => {
    if (focused) return null;
    if (hoverId) return new Set(neighborhood(hoverId, adjacency, depth).keys());
    const query = searchQuery.trim().toLowerCase();
    if (query) return new Set(nodes.filter((n) => n.title.toLowerCase().includes(query)).map((n) => n.id));
    return null;
  }, [focused, hoverId, searchQuery, depth, adjacency, nodes]);
  const dimming = highlight != null;
  // In focus mode the search box filters within the open cluster instead.
  const focusQuery = focused ? searchQuery.trim().toLowerCase() : "";

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

  // ── Camera tween (used for the expand/collapse zoom) ─────────────────────
  const camAnimRef = useRef<number | null>(null);
  const animateTo = useCallback((target: Transform) => {
    if (camAnimRef.current != null) cancelAnimationFrame(camAnimRef.current);
    const stepFn = () => {
      const cur = transformRef.current;
      const nx = cur.x + (target.x - cur.x) * 0.2;
      const ny = cur.y + (target.y - cur.y) * 0.2;
      const nk = cur.k + (target.k - cur.k) * 0.2;
      const done = Math.abs(target.x - nx) < 0.5 && Math.abs(target.y - ny) < 0.5 && Math.abs(target.k - nk) < 0.002;
      const next = done ? target : { x: nx, y: ny, k: nk };
      transformRef.current = next;
      setTransform(next);
      if (!done) camAnimRef.current = requestAnimationFrame(stepFn);
      else camAnimRef.current = null;
    };
    camAnimRef.current = requestAnimationFrame(stepFn);
  }, []);
  useEffect(() => () => {
    if (camAnimRef.current != null) cancelAnimationFrame(camAnimRef.current);
  }, []);

  const fitTransform = useCallback((): Transform | null => {
    const placed = sim.nodes.filter((n) => n.x != null && n.y != null);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of placed) {
      const r = nodeRadius(n.degree) + 34;
      minX = Math.min(minX, n.x! - r); minY = Math.min(minY, n.y! - r);
      maxX = Math.max(maxX, n.x! + r); maxY = Math.max(maxY, n.y! + r);
    }
    // Frame the pucks too, so a ring of clusters never sits off-screen.
    for (const p of puckLayout.values()) {
      const r = p.r + 30;
      minX = Math.min(minX, p.x - r); minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r);
    }
    if (minX === Infinity) return null;
    const gw = maxX - minX, gh = maxY - minY;
    // Fit reveals every node; cap the max so a tiny graph doesn't blow up, and
    // floor only at the epsilon MIN_ZOOM so large graphs frame fully.
    const fit = Math.min(size.width / gw, size.height / gh);
    const k = Math.max(MIN_ZOOM, Math.min(variant === "mini" ? 1.4 : 2, fit));
    return { k, x: (size.width - gw * k) / 2 - minX * k, y: (size.height - gh * k) / 2 - minY * k };
  }, [sim.nodes, puckLayout, size.width, size.height, variant]);

  const fitView = useCallback(() => {
    const t = fitTransform();
    if (t) setTransform(t);
  }, [fitTransform]);

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
    if (nodes.length === 0 || size.width === 0 || focused) return;
    const raf = requestAnimationFrame(() => fitOnce());
    return () => cancelAnimationFrame(raf);
  }, [key, size.width, nodes.length, focused, fitOnce]);

  // Expand → zoom the camera to frame the focused cluster; collapse → restore.
  const preFocusRef = useRef<Transform | null>(null);
  useEffect(() => {
    if (!focusKind) {
      if (preFocusRef.current) {
        animateTo(preFocusRef.current);
        preFocusRef.current = null;
      }
      return;
    }
    const p = puckLayout.get(focusKind);
    if (!p) return;
    if (!preFocusRef.current) preFocusRef.current = transformRef.current;
    const cluster = clusters.find((c) => c.kind === focusKind);
    const spread = clusterSpread(cluster?.count ?? 0) + CLUSTER_NODE_RADIUS + 50;
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(size.width, size.height) / (2 * spread)));
    animateTo({ k, x: size.width / 2 - p.x * k, y: size.height / 2 - p.y * k });
  }, [focusKind, puckLayout, clusters, size.width, size.height, animateTo]);

  // ── Pan (background drag) + wheel zoom ───────────────────────────────────
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    if ((event.target as Element).closest("[data-node],[data-puck]")) return;
    panRef.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y, moved: false };
    svgRef.current?.setPointerCapture(event.pointerId);
  };
  const onBackgroundPointerMove = (event: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    if (!pan.moved && Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > CLICK_SLOP) {
      pan.moved = true;
      markMoved();
    }
    if (pan.moved) setTransform((t) => ({ ...t, x: pan.tx + (event.clientX - pan.x), y: pan.ty + (event.clientY - pan.y) }));
  };
  const onBackgroundPointerUp = () => {
    const pan = panRef.current;
    panRef.current = null;
    // A click on empty space while focused returns to the overview.
    if (pan && !pan.moved && focused) onCollapse?.();
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
          "h-full w-full transition-[opacity,transform] duration-500 ease-out motion-reduce:!transition-none motion-reduce:!duration-0",
          // `will-change` only during the entrance tween — leaving it on keeps a
          // cached GPU raster that the camera zoom then scales up, blurring the
          // vectors until a repaint (e.g. hover) invalidates it.
          entered ? "scale-100 opacity-100" : "scale-[0.985] opacity-0 will-change-transform",
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
          {/* Connected core + pucks — faded out while a cluster is focused. */}
          <g
            style={{
              opacity: focused ? 0 : 1,
              transition: "opacity .3s ease",
              pointerEvents: focused ? "none" : "auto",
            }}
          >
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
                    {r >= 6 ? <NodeIcon meta={meta} r={r} /> : null}
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
            {/* Cluster pucks (circular, count-in-disc, label beneath). */}
            {variant === "full" ? (
              <g>
                {clusters.map((cluster) => {
                  const p = puckLayout.get(cluster.kind);
                  if (!p) return null;
                  // Calm, monochromatic per kind: a soft tinted surface (accent
                  // barely mixed into the card), a low-contrast border, and dots
                  // in a muted accent "ink" (accent pulled toward the fg) — never
                  // a saturated fill with loud white dots.
                  const accent = refKindAccentVar(cluster.kind);
                  const backFill = `color-mix(in oklab, ${accent} 20%, var(--card))`;
                  const frontFill = `color-mix(in oklab, ${accent} 13%, var(--card))`;
                  const stroke = `color-mix(in oklab, ${accent} 34%, var(--border))`;
                  const dot = `color-mix(in oklab, ${accent} 60%, var(--foreground))`;
                  return (
                    <g
                      key={cluster.kind}
                      data-puck
                      transform={`translate(${p.x},${p.y})`}
                      className="cursor-pointer"
                      onClick={() => onExpandCluster?.(cluster.kind)}
                    >
                      {/* faint stacked discs → "many items under here" */}
                      <circle cx={6} cy={5} r={p.r} fill={backFill} />
                      <circle cx={3} cy={2.5} r={p.r} fill={backFill} />
                      <circle r={p.r} fill={frontFill} stroke={stroke} strokeWidth={1} />
                      {/* one hollow ring per item (capped) — magnitude at a glance, no number */}
                      {puckDots(cluster.count, p.r).map((d, i) => (
                        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="none" stroke={dot} strokeWidth={Math.max(0.35, d.r * 0.16)} opacity={0.9} style={{ pointerEvents: "none" }} />
                      ))}
                      <text
                        y={p.r + 13}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={600}
                        fill="var(--foreground)"
                        style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3, strokeLinejoin: "round" }}
                      >
                        {REF_KIND_LABEL[cluster.kind]}
                      </text>
                    </g>
                  );
                })}
              </g>
            ) : null}
          </g>

          {/* Focused cluster's items — the only thing interactive while focused. */}
          {focusKind ? (
            <g style={{ opacity: focused ? 1 : 0, transition: "opacity .3s ease" }}>
              {focusPositions.map(({ node, x, y }) => {
                const r = CLUSTER_NODE_RADIUS;
                const isHover = node.id === hoverId;
                const faded = focusQuery !== "" && !node.title.toLowerCase().includes(focusQuery);
                return (
                  <g
                    key={node.id}
                    data-node
                    transform={`translate(${x},${y})`}
                    className="cursor-pointer"
                    style={{ opacity: faded ? 0.2 : 1, transition: "opacity .18s" }}
                    onClick={() => onSelect(node.id, node.kind)}
                    onPointerEnter={() => setHoverId(node.id)}
                    onPointerLeave={() => setHoverId((current) => (current === node.id ? null : current))}
                  >
                    <circle r={r} fill="var(--background)" stroke="var(--border)" strokeWidth={1.5} />
                    <NodeIcon meta={node} r={r} />
                    {isHover ? (
                      <text
                        y={r + 11}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={600}
                        fill="var(--foreground)"
                        style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3, strokeLinejoin: "round" }}
                      >
                        {node.title.length > 22 ? `${node.title.slice(0, 21)}…` : node.title}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          ) : null}
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
