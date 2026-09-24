"use client";

/**
 * One entity as a list row: its kind's icon in its kind's accent, a label, and
 * whatever trailing detail the surface adds.
 *
 * Opening it works the way an inline `[[ ]]` chip does — `dispatchOpenEntity`,
 * which the command palette turns into navigation (notes, days) or the shared
 * popup (tasks, bookmarks, quotes, events). Pass `href` for a kind that simply
 * navigates, and the row becomes a real link so middle-click and open-in-new-tab
 * keep working.
 *
 * Written for the Day surface, which lists five kinds side by side. Anything
 * else mixing kinds in a list should use this rather than choosing its own
 * icons: the icon and accent then stay tied to `tokens.ts`, so a new kind
 * reaches every list at once.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { dispatchOpenEntity } from "@/components/links/EntityRefNode";
import { REF_KIND_ICON, refKindAccentVar, type RefKind } from "@/lib/links/tokens";
import { cn } from "@/lib/shared/utils";

interface EntityRowProps {
  kind: RefKind;
  id: string;
  /** The label — a string, or richer content such as an action verb. */
  children: ReactNode;
  /** Right-aligned detail: a time, a due label, a state. */
  trailing?: ReactNode;
  /** Struck through and dimmed — something already finished. */
  done?: boolean;
  /** Where the row goes, for kinds that navigate rather than open a popup. */
  href?: string;
}

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/40 dark:bg-card/80 px-3 py-2 text-left text-sm transition-colors hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EntityRow({ kind, id, children, trailing, done, href }: EntityRowProps) {
  const Icon = REF_KIND_ICON[kind];

  const body = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: refKindAccentVar(kind) }} aria-hidden />
      <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>{children}</span>
      {trailing ? <span className="shrink-0 text-[11px] text-muted-foreground/70">{trailing}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={ROW_CLASS}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => dispatchOpenEntity(kind, id)} className={ROW_CLASS}>
      {body}
    </button>
  );
}
