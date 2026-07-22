"use client";

/**
 * Compact "N linked" affordance for entity cards. Renders nothing when there
 * are no backlinks; otherwise a quiet link that opens a popover with the local
 * connections graph (centered on this entity) and, beneath it, the list of
 * items that reference it. Keeps cards light — nothing is shown inline.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { CornerUpLeft } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LocalGraphPanel } from "@/components/notes/graph/LocalGraphPanel";
import { OPEN_ENTITY_EVENT, dispatchOpenEntity } from "@/components/links/EntityRefNode";
import { useBacklinks } from "@/hooks/use-links";
import { getApp } from "@/lib/shared/apps";
import { refKindAccentVar } from "@/lib/links/tokens";
import { cn } from "@/lib/shared/utils";

export function LinkedFrom({ targetId, className }: { targetId?: string | null; className?: string }) {
  const backlinks = useBacklinks(targetId);
  const [open, setOpen] = useState(false);

  // Close the popover whenever a target opens (from the graph or the list).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener(OPEN_ENTITY_EVENT, close);
    return () => window.removeEventListener(OPEN_ENTITY_EVENT, close);
  }, [open]);

  if (!targetId || backlinks.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
      >
        <CornerUpLeft className="h-3 w-3" />
        {backlinks.length} linked
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[90vw] gap-0 overflow-hidden p-0">
        <div className="border-b border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Connections
        </div>
        <div className="p-3">
          <LocalGraphPanel pageId={targetId} onNavigateToPage={(id) => dispatchOpenEntity("note", id)} />
        </div>
        <div className="border-t border-border/60 px-2 py-2">
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Linked from
          </div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {backlinks.map((b) => {
              const Icon = getApp(`${b.kind}s`).icon;
              return (
                <button
                  key={`${b.kind}:${b.id}`}
                  type="button"
                  onClick={() => dispatchOpenEntity(b.kind, b.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/60"
                  style={{ "--chip": refKindAccentVar(b.kind) } as CSSProperties}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--chip)" }} />
                  <span className="min-w-0 flex-1 truncate">{b.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
