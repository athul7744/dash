"use client";

import { ArrowLeft, Search } from "lucide-react";

import type { GraphTagLegendEntry } from "@/hooks/use-note-graph";

/**
 * The floating controls panel. In the overview it holds search + the graph
 * toggles + neighbour depth. Inside an expanded cluster only search is
 * meaningful, so it collapses to a Back button + a "search this cluster" box.
 */
export function GraphControls({
  searchQuery,
  onSearchChange,
  hideClusters,
  onToggleClusters,
  showEntities,
  onToggleEntities,
  depth,
  onDepthChange,
  focused = false,
  focusSummary,
  onCollapse,
  onExit,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  hideClusters: boolean;
  onToggleClusters: () => void;
  showEntities: boolean;
  onToggleEntities: () => void;
  depth: number;
  onDepthChange: (value: number) => void;
  focused?: boolean;
  focusSummary?: string;
  onCollapse?: () => void;
  /** Leave the graph for the notes overview (the in-graph "back", desktop). */
  onExit: () => void;
}) {
  return (
    <div className="absolute left-3 top-3 w-52 max-w-[46vw] rounded-xl border border-border/60 bg-popover/90 p-3 shadow-lg backdrop-blur-sm sm:left-4 sm:top-4 sm:w-56">
      {focused ? (
        <div className="mb-2.5">
          <button
            type="button"
            onClick={() => onCollapse?.()}
            className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-[12.5px] font-semibold text-foreground hover:bg-muted/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to graph
          </button>
          {focusSummary ? <p className="mt-1 px-1 text-[11px] text-muted-foreground">{focusSummary}</p> : null}
        </div>
      ) : (
        // The in-graph "back" — desktop only; mobile uses the bottom Overview fab.
        <button
          type="button"
          onClick={onExit}
          className="mb-2.5 hidden w-full items-center gap-1.5 rounded-lg px-1 py-1 text-[12.5px] font-semibold text-foreground hover:bg-muted/60 sm:flex"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Overview
        </button>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={focused ? "Search this cluster…" : "Highlight a node…"}
          className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/60"
        />
      </div>

      {focused ? null : (
        <>
          <label className="mt-3 flex cursor-pointer items-center justify-between text-[12.5px] font-medium">
            <span>Hide clusters</span>
            <button
              type="button"
              role="switch"
              aria-checked={hideClusters}
              onClick={onToggleClusters}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${hideClusters ? "bg-primary" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${hideClusters ? "translate-x-4" : ""}`} />
            </button>
          </label>

          <label className="mt-2.5 flex cursor-pointer items-center justify-between text-[12.5px] font-medium">
            <span>Show other apps</span>
            <button
              type="button"
              role="switch"
              aria-checked={showEntities}
              onClick={onToggleEntities}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${showEntities ? "bg-primary" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showEntities ? "translate-x-4" : ""}`} />
            </button>
          </label>

          <div className="my-3 h-px bg-border" />

          <div className="flex items-center justify-between text-[12.5px] font-medium">
            <span>Neighbour depth</span>
            <span className="text-muted-foreground tabular-nums">{depth}</span>
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={depth}
            onChange={(event) => onDepthChange(Number(event.target.value))}
            className="mt-2 w-full accent-[var(--primary)]"
            aria-label="Neighbour depth"
          />
        </>
      )}
    </div>
  );
}

/** The tag legend, which doubles as a filter (click a tag to toggle it). */
export function GraphLegend({
  tags,
  hiddenTagIds,
  onToggleTag,
}: {
  tags: GraphTagLegendEntry[];
  hiddenTagIds: Set<string>;
  onToggleTag: (id: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="absolute right-3 top-3 w-40 max-w-[42vw] rounded-xl border border-border/60 bg-popover/90 p-3 shadow-lg backdrop-blur-sm sm:right-4 sm:top-4 sm:w-44">
      <h4 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Tags · filter</h4>
      <div className="flex flex-col">
        {tags.map((tag) => {
          const off = hiddenTagIds.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggleTag(tag.id)}
              className={`flex items-center gap-2 rounded-md px-1 py-1 text-[12.5px] font-medium hover:bg-muted/50 ${off ? "opacity-40" : ""}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.cssColor }} />
              <span className="min-w-0 flex-1 truncate text-left">{tag.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{tag.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
