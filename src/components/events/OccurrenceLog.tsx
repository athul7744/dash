"use client";

import { useId, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, MapPin, Pencil, Trash2, X } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActionInput } from "@/components/events/ActionInput";
import { useOccurrences } from "@/hooks/use-events";
import { deleteOccurrence, updateOccurrence, type Occurrence } from "@/lib/events/events";
import { cn, formatRelativeTime } from "@/lib/shared/utils";

/** Local noon of a picked day, so an edited date lands on that calendar day. */
function atNoon(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString();
}

const SOURCE_LABEL: Record<Occurrence["source"], string> = { manual: "logged", task: "task", schedule: "scheduled" };

/**
 * The full occurrence log for one event: newest first, grouped by month, each
 * row editable inline (date / place / note) or deletable. This is the recall
 * surface the card never had — every occurrence is individually addressable.
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
          {rows.map((o) =>
            editing === o.id ? (
              <OccurrenceEditRow
                key={o.id}
                occurrence={o}
                placeSuggestions={placeSuggestions}
                onDone={() => setEditing(null)}
              />
            ) : (
              <OccurrenceRow key={o.id} occurrence={o} onEdit={() => setEditing(o.id)} />
            ),
          )}
        </div>
      ))}
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
        <IconBtn label="Edit" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn label="Delete" onClick={() => void deleteOccurrence(o.id)} danger>
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
      </div>
    </div>
  );
}

function OccurrenceEditRow({
  occurrence: o,
  placeSuggestions,
  onDone,
}: {
  occurrence: Occurrence;
  placeSuggestions: string[];
  onDone: () => void;
}) {
  const [date, setDate] = useState<Date>(o.at ? new Date(o.at) : new Date());
  const [action, setAction] = useState(o.action);
  const [place, setPlace] = useState(o.place);
  const [note, setNote] = useState(o.note);
  const [calOpen, setCalOpen] = useState(false);
  const placeListId = useId();

  const save = () => {
    void updateOccurrence(o.id, { at: atNoon(date), action: action.trim(), place: place.trim(), note: note.trim() });
    onDone();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/30 px-4 py-2.5 last:border-b-0">
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/60 px-2.5 text-xs tabular-nums text-foreground">
          {format(date, "PP")}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) setDate(d);
              setCalOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <div className="w-36 shrink-0">
        <ActionInput value={action} onChange={setAction} placeholder="what happened?" />
      </div>
      <div className="relative w-32 shrink-0">
        <MapPin className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          list={placeListId}
          placeholder="place"
          className="h-8 w-full rounded-md border border-border/60 bg-transparent pl-7 pr-2 text-xs outline-none"
        />
        <datalist id={placeListId}>
          {placeSuggestions.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="note"
        className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-transparent px-2 text-xs outline-none"
      />
      <IconBtn label="Save" onClick={save}>
        <Check className="h-3.5 w-3.5" />
      </IconBtn>
      <IconBtn label="Cancel" onClick={onDone}>
        <X className="h-3.5 w-3.5" />
      </IconBtn>
    </div>
  );
}

function IconBtn({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent",
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
