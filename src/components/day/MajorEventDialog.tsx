"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AlignLeft, CalendarDays, ChevronDown, Smile, Tags, Type } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectedTagPills } from "@/components/tags/SelectedTagPills";
import { TagSelector } from "@/components/tags/TagSelector";
import { IconPicker } from "@/components/notes/IconPicker";
import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { useToast } from "@/components/toast/ToastProvider";
import {
  createMajorEvent,
  majorEventDayKey,
  MAX_MAJOR_EVENT_TAGS,
  updateMajorEvent,
  type MajorEvent,
} from "@/lib/major-events/major-events";
import { useDerivedState } from "@/hooks/use-derived-state";
import { localDayFromKey } from "@/lib/tracker/day-keys";
import { cn } from "@/lib/shared/utils";

/** Hairline rows, muted leading icons, one accent — the Events popover's language. */
const ROW = "flex items-center gap-2.5 border-t border-border py-2.5 text-[13.5px]";
const ICON = "h-[15px] w-[15px] shrink-0 text-muted-foreground/70";
const TRIGGER =
  "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-1.5 text-[13.5px] text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface MajorEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The day being marked — the default date for a new event. */
  date: Date;
  /** Pass an event to edit it; omit to create one on `date`. */
  event?: MajorEvent | null;
}

/**
 * Mark or edit a major event: a title, a day, an icon, its tags and a note.
 *
 * Tags are the event's only classification, and their colours are what it wears
 * everywhere it appears — so the row picks tags with the app's `TagSelector`
 * rather than offering a colour of its own, capped at `MAX_MAJOR_EVENT_TAGS`.
 *
 * Built in the same language as the Events app's schedule popover — a compact
 * panel, hairline rows with muted icons, borderless inline fields, one accent on
 * the single primary button — rather than a stack of boxed form fields.
 */
export function MajorEventDialog({ open, onOpenChange, date, event = null }: MajorEventDialogProps) {
  const { toast } = useToast();
  const editing = event !== null;

  // The draft is derived from (open, event, day): reopening — or being pointed at
  // another event — re-seeds it, so a cancelled edit never leaks into the next.
  const draftKey = `${open}|${event?.id ?? "new"}|${majorEventDayKey(date)}|${event?.at ?? ""}|${(event?.tagIds ?? []).join(",")}`;
  const [draft, setDraft] = useDerivedState(draftKey, () => ({
    title: event?.title ?? "",
    note: event?.note ?? "",
    tagIds: event?.tagIds ?? [],
    emoji: event?.emoji ?? null,
    day: event?.at ? localDayFromKey(event.at) : date,
  }));
  const { title, note, tagIds, emoji, day } = draft;
  const [isSaving, setIsSaving] = useState(false);

  const canSave = title.trim().length > 0 && !isSaving;

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      if (editing && event) {
        await updateMajorEvent(event.id, { at: day, title, note, emoji, tagIds });
      } else {
        await createMajorEvent({ at: day, title, note, emoji, tagIds });
      }
      onOpenChange(false);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : "Couldn't save that major event." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="w-[25rem] max-w-[calc(100%-2rem)] gap-0 p-0">
        <DialogTitle className="sr-only">{editing ? "Edit major event" : "Mark as major event"}</DialogTitle>

        <div className="px-4 pb-1 pt-4">
          <div className="text-xs font-semibold text-muted-foreground/70">
            {editing ? "Major event" : "New major event"}
          </div>

          {/* Title: the one big field, no box. */}
          <div className="flex items-center gap-2.5 py-2.5">
            <Type className={ICON} />
            <input
              autoFocus
              value={title}
              maxLength={120}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void save();
                }
              }}
              placeholder="Something worth remembering"
              aria-label="What happened"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Day */}
          <div className={ROW}>
            <CalendarDays className={ICON} />
            <span className="shrink-0">Day</span>
            <Popover>
              <PopoverTrigger className={cn(TRIGGER, "ml-auto")} aria-label={`Day: ${format(day, "PPP")}`}>
                {format(day, "d MMM yyyy")}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={day}
                  defaultMonth={day}
                  onSelect={(picked) => {
                    if (picked) setDraft((d) => ({ ...d, day: picked }));
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Icon */}
          <div className={ROW}>
            <Smile className={ICON} />
            <span className="shrink-0">Icon</span>
            <div className="ml-auto flex items-center gap-1">
              <Popover>
                <PopoverTrigger className={TRIGGER} aria-label={emoji ? "Change icon" : "Add an icon"}>
                  {emoji ? <SpriteIcon name={emoji} size={16} /> : <span className="text-muted-foreground">None</span>}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
                </PopoverTrigger>
                <PopoverContent className="w-auto rounded-2xl p-2" align="end">
                  <IconPicker
                    value={emoji}
                    onSelect={(icon) => setDraft((d) => ({ ...d, emoji: icon }))}
                    onClear={() => setDraft((d) => ({ ...d, emoji: null }))}
                  />
                </PopoverContent>
              </Popover>
              {emoji ? (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, emoji: null }))}
                  aria-label="Remove icon"
                  className="rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {/* Tags — the event's only classification, and where its colours come
              from: the pills below wear each tag's own colour. */}
          <div className={cn(ROW, "items-start")}>
            <Tags className={cn(ICON, "mt-[6px]")} />
            <span className="shrink-0 leading-6">Tags</span>
            <div className="ml-auto flex max-w-[70%] flex-col items-end gap-1">
              <TagSelector
                selectedTagIds={tagIds}
                onSelectedTagIdsChange={(next) => setDraft((d) => ({ ...d, tagIds: next }))}
                triggerLabel="Add"
                triggerProps={{ "aria-label": "Add a tag to this event" }}
                popoverWidthClassName="w-[220px]"
                showSelectedTags={false}
                maxSelected={MAX_MAJOR_EVENT_TAGS}
                align="end"
              />
              <SelectedTagPills tagIds={tagIds} className="justify-end" />
            </div>
          </div>

          {/* Note — label and placeholder share the same line box, so the text
              starts flush with "Note" instead of a pixel above it. */}
          <div className={cn(ROW, "items-start")}>
            <AlignLeft className={cn(ICON, "mt-[3px]")} />
            <span className="shrink-0 leading-5">Note</span>
            <textarea
              value={note}
              rows={2}
              maxLength={500}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Why it mattered"
              aria-label="Note"
              className="min-w-0 flex-1 resize-none bg-transparent text-[13.5px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
          <span className="text-[11.5px] text-muted-foreground/70">
            {editing ? "A waypoint in the year" : "Marks this day as a waypoint"}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="ml-auto rounded-[10px] px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="rounded-[10px] bg-rose-600 px-4 py-1.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-rose-500"
          >
            {isSaving ? "Saving…" : editing ? "Save" : "Mark event"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
