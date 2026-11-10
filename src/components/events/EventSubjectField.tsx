"use client";

import { useMemo, useState } from "react";
import { Link2, X } from "lucide-react";

import { RefField } from "@/components/links/RefField";
import { useSubjectLabels } from "@/hooks/use-events";
import { updateEvent, type EventItem } from "@/lib/events/events";
import { parseRefTokens, refKindAccentVar } from "@/lib/links/tokens";
import { getApp } from "@/lib/shared/apps";

/**
 * "Tracks…" — link this event to another entity so its logs land on that
 * entity's timeline instead of the event's own. Lives on the detail surface
 * (not the schedule dialog): it's about where occurrences land, not cadence.
 * The first id-bound `[[ ]]` token becomes the subject; clearing reverts to self.
 */
export function EventSubjectField({ event }: { event: EventItem }) {
  const [draft, setDraft] = useState("");
  const subjects = useMemo(
    () => (event.subjectId && event.subjectKind ? [{ id: event.subjectId, kind: event.subjectKind }] : []),
    [event.subjectId, event.subjectKind],
  );
  const labels = useSubjectLabels(subjects);

  return (
    <div className="mt-6 rounded-xl border border-border/65 bg-muted/40 p-4 dark:bg-card/80">
      <div className="font-heading text-[11px] font-semibold text-muted-foreground">Tracks</div>

      {event.subjectId && event.subjectKind ? (
        <div className="mt-2 flex items-center gap-2 text-[13.5px]">
          <Link2 className="h-[15px] w-[15px] shrink-0 text-muted-foreground/70" />
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1 text-[12.5px]">
            {(() => {
              const Icon = getApp(`${event.subjectKind}s`).icon;
              return <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: refKindAccentVar(event.subjectKind) }} />;
            })()}
            <span className="min-w-0 truncate">{labels.get(event.subjectId) ?? "…"}</span>
            <button
              type="button"
              aria-label="Clear subject"
              onClick={() => void updateEvent(event.id, { subjectKind: null, subjectId: null })}
              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 text-[13.5px]">
          <Link2 className="h-[15px] w-[15px] shrink-0 text-muted-foreground/70" />
          <RefField
            value={draft}
            singleLine
            excludeId={event.id}
            ariaLabel="Event subject"
            placeholder="Track another thing…  type [["
            onChange={(v) => {
              const tok = parseRefTokens(v).find((t) => t.kind && t.id);
              if (tok?.kind && tok.id) {
                void updateEvent(event.id, { subjectKind: tok.kind, subjectId: tok.id });
                setDraft("");
              } else {
                setDraft(v);
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      )}
    </div>
  );
}
