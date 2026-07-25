"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "lucide-react";

import { useNoteGraph } from "@/hooks/use-note-graph";
import { REF_KIND_LABEL, type RefKind } from "@/lib/links/tokens";
import { dispatchOpenEntity } from "@/components/links/EntityRefNode";
import { NotesGraphCanvas } from "./NotesGraphCanvas";
import { GraphControls, GraphLegend } from "./GraphControls";

/**
 * Full-surface, force-directed graph of the whole vault. Connected items are
 * nodes, resolved `[[links]]` are edges; clicking a node opens it. Every kind's
 * unlinked items collapse into a single cluster puck, expanded on click.
 * Reactive — it live-updates as items and links change.
 */
export function NotesGraphView({ onOpenPage }: { onOpenPage: (id: string) => void }) {
  const { nodes, links, clusters, tags, noteClusterTags, isLoading } = useNoteGraph();

  const [searchQuery, setSearchQuery] = useState("");
  const [hideClusters, setHideClusters] = useState(false);
  const [showEntities, setShowEntities] = useState(true);
  const [depth, setDepth] = useState(1);
  const [hiddenTagIds, setHiddenTagIds] = useState<Set<string>>(new Set());
  const [focusKind, setFocusKind] = useState<RefKind | null>(null);

  // Measure the stage so the SVG and centering forces get real dimensions.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Apply the tag + show-apps filters to the core, then keep only links between
  // the surviving nodes so the simulation never references a hidden node.
  const { visibleNodes, visibleLinks } = useMemo(() => {
    const kept = nodes.filter((node) => {
      if (!showEntities && node.kind !== "note") return false;
      if (node.kind === "note" && node.tagId && hiddenTagIds.has(node.tagId)) return false;
      if (node.kind === "note" && !node.tagId && hiddenTagIds.has("__untagged__")) return false;
      return true;
    });
    const keptIds = new Set(kept.map((n) => n.id));
    const visibleLinks = links.filter((link) => keptIds.has(link.source) && keptIds.has(link.target));
    return { visibleNodes: kept, visibleLinks };
  }, [nodes, links, showEntities, hiddenTagIds]);

  // Cluster pucks respect the same show-apps toggle; "Hide clusters" drops them.
  // The note cluster also honours the tag filter, so the legend works when
  // drilled into it (and the puck's dot count tracks the hidden tags).
  const visibleClusters = useMemo(() => {
    if (hideClusters) return [];
    return clusters
      .filter((c) => showEntities || c.kind === "note")
      .map((c) => {
        if (c.kind !== "note") return c;
        const nodes = c.nodes.filter((n) => !(n.tagId && hiddenTagIds.has(n.tagId)));
        return { ...c, nodes, count: nodes.length };
      })
      .filter((c) => c.count > 0);
  }, [clusters, hideClusters, showEntities, hiddenTagIds]);

  // Only honour a focus whose cluster is still visible (item may have just been
  // linked away, or its kind toggled off) — derived so no effect chases state.
  const activeFocus = focusKind && visibleClusters.some((c) => c.kind === focusKind) ? focusKind : null;
  const focusCount = activeFocus ? (visibleClusters.find((c) => c.kind === activeFocus)?.count ?? 0) : 0;
  const focusSummary = activeFocus ? `${focusCount} ${REF_KIND_LABEL[activeFocus].toLowerCase()} · not yet linked` : undefined;
  // Legend stays visible while drilled in, scoped to that cluster's tags (only
  // the note cluster carries tags; other kinds show an empty — hidden — legend).
  const legendTags = activeFocus === "note" ? noteClusterTags : activeFocus ? [] : tags;

  // Search is scoped to the current view, so reset it whenever focus changes.
  const expandCluster = (kind: RefKind) => {
    setSearchQuery("");
    setFocusKind(kind);
  };
  const collapse = () => {
    setSearchQuery("");
    setFocusKind(null);
  };

  // Toggling either control ends an open focus (a hidden cluster can't stay open).
  const toggleClusters = () => {
    setHideClusters((value) => !value);
    collapse();
  };
  const toggleEntities = () => {
    setShowEntities((value) => !value);
    collapse();
  };

  const toggleTag = (id: string) =>
    setHiddenTagIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isEmpty = !isLoading && nodes.length === 0 && clusters.length === 0;

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-border/60 bg-[var(--graph-bg,var(--card))]"
      style={{ backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 0)", backgroundSize: "26px 26px" }}
    >
      <div ref={stageRef} className="absolute inset-0">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Network className="h-8 w-8 opacity-50" />
            <p className="max-w-xs text-sm">No pages yet. Create pages and connect them with <span className="font-medium text-foreground">[[links]]</span> to grow your graph.</p>
          </div>
        ) : size.width > 0 ? (
          <NotesGraphCanvas
            nodes={visibleNodes}
            links={visibleLinks}
            clusters={visibleClusters}
            focusKind={activeFocus}
            onExpandCluster={expandCluster}
            onCollapse={collapse}
            size={size}
            selectedId={null}
            onSelect={(id, kind) => (kind === "note" ? onOpenPage(id) : dispatchOpenEntity(kind, id))}
            depth={depth}
            searchQuery={searchQuery}
          />
        ) : null}
      </div>

      {!isEmpty ? (
        <>
          <GraphControls
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            hideClusters={hideClusters}
            onToggleClusters={toggleClusters}
            showEntities={showEntities}
            onToggleEntities={toggleEntities}
            depth={depth}
            onDepthChange={setDepth}
            focused={activeFocus != null}
            focusSummary={focusSummary}
            onCollapse={collapse}
          />
          <GraphLegend tags={legendTags} hiddenTagIds={hiddenTagIds} onToggleTag={toggleTag} />
          {/* Overview stats — hidden while a cluster is open (the focus title covers it). */}
          {activeFocus ? null : (
            /* Mobile: a pill above the Overview fab, lifted above the bottom fade (z-50). Desktop: plain text bottom-left. */
            <div className="pointer-events-none absolute bottom-14 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/60 bg-popover/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-md backdrop-blur-sm sm:bottom-5 sm:left-5 sm:top-auto sm:z-auto sm:translate-x-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs sm:shadow-none sm:backdrop-blur-none">
              <b className="text-foreground tabular-nums">{visibleNodes.length}</b> nodes · <b className="text-foreground tabular-nums">{visibleLinks.length}</b> links · <b className="text-foreground tabular-nums">{visibleClusters.length}</b> clusters
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
