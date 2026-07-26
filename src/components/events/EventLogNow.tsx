"use client";

import { useId, useState } from "react";
import { format, isToday, isYesterday, subDays } from "date-fns";
import { ChevronDown, Clock, MapPin, Plus, StickyNote } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActionInput } from "@/components/events/ActionInput";
import { useMediaQuery } from "@/hooks/use-media-query";
import { logOccurrence } from "@/lib/events/events";
import type { RefKind } from "@/lib/links/tokens";
import { cn } from "@/lib/shared/utils";

/** Stopwatch mark — the app's identity for "log a moment" (distinct from Plus/History). */
function StopwatchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="13" r="8" />
      <path d="M9 2h6M12 2v3M12 10v6M9 13h6" />
    </svg>
  );
}

interface LogProps {
  /** Subject the occurrence is logged against — any entity id, not just events. */
  subjectId: string;
  /** Kind of that subject; stored on the occurrence so it renders/filters correctly. */
  subjectKind?: RefKind;
  defaultPlace?: string;
  placeSuggestions?: string[];
  /**
   * Trigger shape:
   *  - "reveal" (default) — 32px stopwatch, reveals "Log" on hover (spacious rows).
   *  - "icon"   — fixed 32px icon button, matches sibling card actions exactly.
   *  - "label"  — stopwatch + "Log" always shown (FAB / notes rail).
   */
  variant?: "reveal" | "icon" | "label";
  /**
   * Compose opens as a lightweight Popover only when this trigger lives in a
   * card AND the viewport is desktop; otherwise (mobile, or on a page like the
   * detail view) it opens as a centered Dialog, matching how pages log.
   */
  inCard?: boolean;
}

function TriggerInner({ variant }: { variant: NonNullable<LogProps["variant"]> }) {
  return (
    <>
      <StopwatchIcon className="h-4 w-4 shrink-0" />
      {variant !== "icon" ? (
        <span
          className={cn(
            "whitespace-nowrap font-medium",
            variant === "label" ? "text-sm" : "max-w-0 overflow-hidden text-xs opacity-0 transition-all group-hover:ml-1.5 group-hover:max-w-[36px] group-hover:opacity-100",
          )}
        >
          Log
        </span>
      ) : null}
    </>
  );
}

function triggerClass(variant: NonNullable<LogProps["variant"]>) {
  return cn(
    "group inline-flex items-center justify-center rounded-full outline-none transition-all focus-visible:ring-1 focus-visible:ring-ring",
    variant === "label"
      ? "gap-1.5 text-sm font-medium text-foreground"
      : variant === "icon"
        ? "h-8 w-8 text-muted-foreground hover:bg-accent hover:text-violet-600 dark:hover:text-violet-400"
        : "h-8 px-2 text-muted-foreground hover:bg-accent hover:text-violet-600 dark:hover:text-violet-400",
  );
}

/**
 * The single, quiet way to log an occurrence — a small stopwatch trigger that
 * ALWAYS opens Compose (no one-tap, so nothing is logged by accident). Compose
 * leads with "what happened", defaults the moment to now (date **and** time),
 * and keeps place/note optional. On a card on desktop it opens as a Popover
 * anchored to the trigger; everywhere else (mobile, or on a page) as a Dialog.
 */
export function EventLogNow({ subjectId, subjectKind = "event", defaultPlace = "", placeSuggestions = [], variant = "reveal", inCard = false }: LogProps) {
  const [open, setOpen] = useState(false);
  const [seq, setSeq] = useState(0);
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const asPopover = inCard && isDesktop;

  if (asPopover) {
    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setSeq((n) => n + 1); // fresh Compose state each open
        }}
      >
        <PopoverTrigger aria-label="Log an event" title="Log an event" className={triggerClass(variant)}>
          <TriggerInner variant={variant} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <ComposeForm
            key={seq}
            subjectId={subjectId}
            subjectKind={subjectKind}
            defaultPlace={defaultPlace}
            placeSuggestions={placeSuggestions}
            onDone={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <button type="button" aria-label="Log an event" title="Log an event" className={triggerClass(variant)} onClick={() => setOpen(true)}>
        <TriggerInner variant={variant} />
      </button>
      <EventComposeDialog
        subjectId={subjectId}
        subjectKind={subjectKind}
        defaultPlace={defaultPlace}
        placeSuggestions={placeSuggestions}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/**
 * The same Compose flow as a controlled modal — for triggers that aren't a
 * popover anchor (e.g. a "Log an event" item in the notes page menu).
 */
export function EventComposeDialog({
  subjectId,
  subjectKind = "event",
  defaultPlace = "",
  placeSuggestions = [],
  open,
  onOpenChange,
}: LogProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="w-80 max-w-[calc(100%-2rem)] gap-0 p-0">
        <DialogTitle className="sr-only">Log an event</DialogTitle>
        {open ? (
          <ComposeForm
            subjectId={subjectId}
            subjectKind={subjectKind}
            defaultPlace={defaultPlace}
            placeSuggestions={placeSuggestions}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type Rel = "now" | "morning" | "yesterday" | "lastweek" | null;

/** Compose: action-first, now-first (date + time), place/note optional. */
function ComposeForm({
  subjectId,
  subjectKind,
  defaultPlace,
  placeSuggestions,
  onDone,
}: Required<Pick<LogProps, "subjectId" | "subjectKind" | "defaultPlace" | "placeSuggestions">> & { onDone: () => void }) {
  const opened = new Date();
  const [action, setAction] = useState("");
  const [date, setDate] = useState<Date>(opened);
  const [hours, setHours] = useState(opened.getHours());
  const [minutes, setMinutes] = useState(opened.getMinutes());
  const [place, setPlace] = useState(defaultPlace);
  const [note, setNote] = useState("");
  const [whenOpen, setWhenOpen] = useState(false);
  const [rel, setRel] = useState<Rel>("now");
  const placeListId = useId();

  const combined = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
  const dayLabel = isToday(combined) ? "Today" : isYesterday(combined) ? "Yesterday" : format(combined, "MMM d");

  const h12 = ((hours + 11) % 12) + 1;
  const ampm = hours < 12 ? "AM" : "PM";
  const setH12 = (n: number) => {
    const nn = Math.min(12, Math.max(1, n || 12)) % 12;
    setHours(ampm === "PM" ? nn + 12 : nn);
    setRel(null);
  };
  const setAmPm = (ap: "AM" | "PM") => {
    setHours((ap === "PM" ? (hours % 12) + 12 : hours % 12) % 24);
    setRel(null);
  };
  const setMin = (n: number) => {
    setMinutes(Math.min(59, Math.max(0, n || 0)));
    setRel(null);
  };

  const applyRel = (r: Rel) => {
    const t = new Date();
    setRel(r);
    if (r === "now") {
      setDate(t);
      setHours(t.getHours());
      setMinutes(t.getMinutes());
    } else if (r === "morning") {
      setDate(t);
      setHours(9);
      setMinutes(0);
    } else if (r === "yesterday") {
      setDate(subDays(t, 1));
    } else if (r === "lastweek") {
      setDate(subDays(t, 7));
    }
  };

  const submit = () => {
    void logOccurrence(subjectId, { at: combined, action, place, note, source: "manual", subjectKind });
    onDone();
  };

  const CHIPS: { rel: Exclude<Rel, null>; label: string }[] = [
    { rel: "now", label: "Now" },
    { rel: "morning", label: "This morning" },
    { rel: "yesterday", label: "Yesterday" },
    { rel: "lastweek", label: "Last week" },
  ];

  return (
    <div>
      <div className="px-4 pb-3 pt-4">
        <div className="text-xs font-semibold text-muted-foreground/70">New entry</div>

        <div className="py-2.5">
          <ActionInput value={action} onChange={setAction} variant="plain" placeholder="What happened?" autoFocus />
        </div>

        {/* When: a calm summary line that expands to calendar + time + quick chips. */}
        <button
          type="button"
          onClick={() => setWhenOpen((v) => !v)}
          aria-expanded={whenOpen}
          className="flex w-full items-center gap-2.5 border-t border-border py-2.5 text-left"
        >
          <Clock className="h-[15px] w-[15px] shrink-0 text-muted-foreground/70" />
          <span className="flex-1 text-[13.5px]">
            {dayLabel}
            <span className="text-muted-foreground"> · {format(combined, "p")}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground/70 transition-transform", whenOpen && "rotate-180")} />
        </button>

        {whenOpen ? (
          <div className="pb-1 pt-0.5">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {CHIPS.map((c) => (
                <button
                  key={c.rel}
                  type="button"
                  onClick={() => applyRel(c.rel)}
                  aria-pressed={rel === c.rel}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    rel === c.rel
                      ? "border-violet-500/35 bg-violet-500/15 text-violet-600 dark:text-violet-400"
                      : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <Calendar
              mode="single"
              selected={combined}
              onSelect={(d) => {
                if (d) {
                  setDate(d);
                  setRel(null);
                }
              }}
            />

            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <Clock className="h-3.5 w-3.5" /> Time
              </span>
              <div className="ml-auto inline-flex items-center gap-0.5 rounded-lg border border-border px-1.5 py-1">
                <input
                  value={String(h12).padStart(2, "0")}
                  onChange={(e) => setH12(parseInt(e.target.value.replace(/\D/g, ""), 10))}
                  inputMode="numeric"
                  maxLength={2}
                  aria-label="Hour"
                  className="w-6 bg-transparent text-center text-[13px] tabular-nums outline-none focus:rounded focus:bg-accent"
                />
                <span className="text-muted-foreground/70">:</span>
                <input
                  value={String(minutes).padStart(2, "0")}
                  onChange={(e) => setMin(parseInt(e.target.value.replace(/\D/g, ""), 10))}
                  inputMode="numeric"
                  maxLength={2}
                  aria-label="Minute"
                  className="w-6 bg-transparent text-center text-[13px] tabular-nums outline-none focus:rounded focus:bg-accent"
                />
                <div className="ml-1 inline-flex overflow-hidden rounded-full border border-border">
                  {(["AM", "PM"] as const).map((ap) => (
                    <button
                      key={ap}
                      type="button"
                      onClick={() => setAmPm(ap)}
                      aria-pressed={ampm === ap}
                      className={cn("px-2 py-0.5 text-[11px] font-semibold", ampm === ap ? "bg-violet-500/15 text-violet-600 dark:text-violet-400" : "text-muted-foreground")}
                    >
                      {ap}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2.5 border-t border-border py-2">
          <MapPin className="h-[15px] w-[15px] shrink-0 text-muted-foreground/70" />
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            list={placeListId}
            placeholder="Where? (optional)"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/60"
          />
          <datalist id={placeListId}>
            {placeSuggestions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <div className="flex items-center gap-2.5 border-t border-border py-2">
          <StickyNote className="h-[15px] w-[15px] shrink-0 text-muted-foreground/70" />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <span className="text-[11.5px] text-muted-foreground/70">logs to this timeline</span>
        <button
          type="button"
          onClick={submit}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] bg-violet-600 px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-violet-500"
        >
          <Plus className="h-3.5 w-3.5" /> Log
        </button>
      </div>
    </div>
  );
}
