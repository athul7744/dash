"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "lucide-react";

import { useNoteGraph } from "@/hooks/use-note-graph";
import { isOrphan } from "@/lib/notes/graph";
import { dispatchOpenEntity } from "@/components/links/EntityRefNode";
import { NotesGraphCanvas } from "./NotesGraphCanvas";
import { GraphControls, GraphLegend } from "./GraphControls";

/**
 * Full-surface, force-directed graph of the whole vault. Pages are nodes,
 * resolved `[[links]]` are edges; clicking a node opens that page. Reactive —
 * it live-updates as pages and links change.
 */
export function NotesGraphView({ onOpenPage }: { onOpenPage: (id: string) => void }) {
  const { nodes, links, tags, isLoading } = useNoteGraph();

  const [searchQuery, setSearchQuery] = useState("");
  const [hideOrphans, setHideOrphans] = useState(false);
  const [showEntities, setShowEntities] = useState(true);
  const [depth, setDepth] = useState(1);
  const [hiddenTagIds, setHiddenTagIds] = useState<Set<string>>(new Set());

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

  // Apply the hide-orphans + tag filters, then keep only links between the
  // surviving nodes so the simulation never references a hidden page.
  const { visibleNodes, visibleLinks } = useMemo(() => {
    const kept = nodes.filter((node) => {
      if (!showEntities && node.kind !== "note") return false;
      if (hideOrphans && isOrphan(node)) return false;
      if (node.kind === "note" && node.tagId && hiddenTagIds.has(node.tagId)) return false;
      if (node.kind === "note" && !node.tagId && hiddenTagIds.has("__untagged__")) return false;
      return true;
    });
    const keptIds = new Set(kept.map((n) => n.id));
    const visibleLinks = links.filter((link) => keptIds.has(link.source) && keptIds.has(link.target));
    return { visibleNodes: kept, visibleLinks };
  }, [nodes, links, hideOrphans, showEntities, hiddenTagIds]);

  const toggleTag = (id: string) =>
    setHiddenTagIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isEmpty = !isLoading && nodes.length === 0;

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
            hideOrphans={hideOrphans}
            onToggleOrphans={() => setHideOrphans((value) => !value)}
            showEntities={showEntities}
            onToggleEntities={() => setShowEntities((value) => !value)}
            depth={depth}
            onDepthChange={setDepth}
          />
          <GraphLegend tags={tags} hiddenTagIds={hiddenTagIds} onToggleTag={toggleTag} />
          {/* Mobile: a pill above the Overview fab, lifted above the bottom fade (z-50). Desktop: plain text bottom-left. */}
          <div className="pointer-events-none absolute bottom-14 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/60 bg-popover/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-md backdrop-blur-sm sm:bottom-5 sm:left-5 sm:top-auto sm:z-auto sm:translate-x-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs sm:shadow-none sm:backdrop-blur-none">
            <b className="text-foreground tabular-nums">{visibleNodes.length}</b> nodes · <b className="text-foreground tabular-nums">{visibleLinks.length}</b> links
          </div>
        </>
      ) : null}
    </div>
  );
}
