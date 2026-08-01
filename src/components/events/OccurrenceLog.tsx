"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { MapPin, Pencil, Trash2 } from "lucide-react";

import { EventEditDialog } from "@/components/events/EventLogNow";
import { useOccurrences } from "@/hooks/use-events";
import { deleteOccurrence, type Occurrence } from "@/lib/events/events";
import { cn, formatRelativeTime } from "@/lib/shared/utils";

const SOURCE_LABEL: Record<Occurrence["source"], string> = { manual: "logged", task: "task", schedule: "scheduled" };

const iconBtnClass = (danger?: boolean) =>
  cn(
    "grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent",
    danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:text-foreground",
  );

/**
 * The full occurrence log for one event: newest first, grouped by month, each
 * row editable via a centered dialog (date / time / place / note) or deletable.
 * This is the recall surface the card never had — every occurrence is addressable.
 */
export function OccurrenceLog({ subjectId, placeSuggestions = [] }: { subjectId: string; placeSuggestions?: string[] }) {
  const { occurrences, isLoading } = useOccurrences({ thingId: subjectId, limit: 400 });
  const [editing, setEditing] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occurrences) {
      const key = o.at ? format(new Date(o.at), "MMMM yyyy") : "Undated";
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [occurrences]);

  const editingOcc = editing ? occurrences.find((o) => o.id === editing) ?? null : null;

  if (isLoading) return null;
  if (occurrences.length === 0) {
    return <p className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground/70">No occurrences yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/65">
      {groups.map(([month, rows]) => (
        <div key={month}>
          <div className="border-b border-border/50 bg-muted/40 px-4 py-1.5 text-xs font-semibold text-muted-foreground">
            {month}
          </div>
          {rows.map((o) => (
            <OccurrenceRow key={o.id} occurrence={o} onEdit={() => setEditing(o.id)} />
          ))}
        </div>
      ))}

      <EventEditDialog
        occurrence={editingOcc}
        placeSuggestions={placeSuggestions}
        open={editingOcc !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}

function OccurrenceRow({ occurrence: o, onEdit }: { occurrence: Occurrence; onEdit: () => void }) {
  const at = o.at ? new Date(o.at) : null;
  return (
    <div className="group flex items-center gap-3 border-b border-border/40 px-4 py-2.5 last:border-b-0 hover:bg-muted/30">
      <span className="w-24 shrink-0 text-sm font-medium tabular-nums text-foreground">{at ? format(at, "PP") : "—"}</span>
      {o.action ? <span className="shrink-0 text-sm font-medium text-foreground">{o.action}</span> : null}
      {at ? <span className="shrink-0 text-xs text-muted-foreground/60">{formatRelativeTime(at)}</span> : null}
      {o.place ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {o.place}
        </span>
      ) : null}
      {o.note ? <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground">{o.note}</span> : <span className="flex-1" />}
      {o.source !== "manual" ? (
        <span
          className="shrink-0 rounded-full border border-violet-500/30 px-2 py-0.5 text-[11px] text-violet-600 dark:text-violet-400"
          title={o.source === "task" ? "Auto-logged when a linked task was completed" : "Auto-logged by the schedule"}
        >
          {SOURCE_LABEL[o.source]}
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" aria-label="Edit" title="Edit" onClick={onEdit} className={iconBtnClass()}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Delete" title="Delete" onClick={() => void deleteOccurrence(o.id)} className={iconBtnClass(true)}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
