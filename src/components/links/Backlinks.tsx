"use client";

/**
 * Compact inbound-links row: every entity that references `targetId`, shown as
 * app-coloured chips that open the source on click. Renders nothing when there
 * are no backlinks, so it can sit on every card unconditionally.
 */

import type { CSSProperties } from "react";
import { CornerUpLeft } from "lucide-react";

import { dispatchOpenEntity } from "@/components/links/EntityRefNode";
import { useBacklinks } from "@/hooks/use-links";
import { getApp } from "@/lib/shared/apps";
import { refKindAccentVar, type RefKind } from "@/lib/links/tokens";
import { cn } from "@/lib/shared/utils";

export function Backlinks({
  targetId,
  className,
  exclude,
}: {
  targetId?: string | null;
  className?: string;
  /** Kinds to omit (e.g. notes, when they're shown in a richer list elsewhere). */
  exclude?: RefKind[];
}) {
  const all = useBacklinks(targetId);
  const backlinks = exclude?.length ? all.filter((b) => !exclude.includes(b.kind)) : all;
  if (backlinks.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/70">
        <CornerUpLeft className="h-3 w-3" />
        Linked from
      </span>
      {backlinks.map((b) => {
        const Icon = getApp(`${b.kind}s`).icon;
        return (
          <button
            key={`${b.kind}:${b.id}`}
            type="button"
            title={b.label}
            onClick={() => dispatchOpenEntity(b.kind, b.id)}
            className="entity-ref-chip max-w-[12rem] text-[12px]"
            style={{ "--chip": refKindAccentVar(b.kind) } as CSSProperties}
          >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}
