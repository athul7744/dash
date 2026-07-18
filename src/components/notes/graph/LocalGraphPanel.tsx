"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useNoteGraph } from "@/hooks/use-note-graph";
import { neighborhood } from "@/lib/notes/graph";
import { NotesGraphCanvas } from "./NotesGraphCanvas";

/**
 * A compact graph of the current page's neighbourhood, shown in the details
 * rail's Connections tab. Reuses the full graph engine, filtered to the pages
 * within `depth` hops of the open page. Clicking a node navigates to it.
 */
export function LocalGraphPanel({
  pageId,
  onNavigateToPage,
}: {
  pageId: string;
  onNavigateToPage: (id: string) => void;
}) {
  const { nodes, links } = useNoteGraph();
  const [depth, setDepth] = useState(1);

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

  const { subNodes, subLinks, hasNeighbours } = useMemo(() => {
    const ids = new Set(neighborhood(pageId, links, depth).keys());
    const subNodes = nodes.filter((n) => ids.has(n.id));
    const subLinks = links.filter((l) => ids.has(l.source) && ids.has(l.target));
    return { subNodes, subLinks, hasNeighbours: ids.size > 1 };
  }, [pageId, nodes, links, depth]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
          {subNodes.length} nearby
        </span>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>depth</span>
          {[1, 2].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDepth(value)}
              className={`grid size-5 place-items-center rounded-md tabular-nums transition-colors ${depth === value ? "bg-muted text-foreground" : "hover:bg-muted/50"}`}
              aria-pressed={depth === value}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div ref={stageRef} className="relative h-44 overflow-hidden rounded-xl border border-border/50 bg-[var(--card)]">
        {!hasNeighbours ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-muted-foreground">
            No linked pages yet.
          </div>
        ) : size.width > 0 ? (
          <NotesGraphCanvas
            nodes={subNodes}
            links={subLinks}
            size={size}
            selectedId={pageId}
            onSelect={onNavigateToPage}
            depth={1}
            variant="mini"
          />
        ) : null}
      </div>
    </div>
  );
}
