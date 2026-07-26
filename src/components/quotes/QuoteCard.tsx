"use client";

import { useEffect, useState } from "react";
import { Ellipsis, Star, Trash2 } from "lucide-react";

import { EventLogNow } from "@/components/events/EventLogNow";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LinkedFrom } from "@/components/links/LinkedFrom";
import { RefField } from "@/components/links/RefField";
import { useDebouncedSave } from "@/hooks/use-debounced-save";
import { reconcileEntityRefs } from "@/lib/links/links";
import { deleteQuote, toggleFavorite, updateQuote, type Quote } from "@/lib/quotes/quotes";
import { cn } from "@/lib/shared/utils";

/**
 * A single editable quote: a quote-text field (supports inline `[[ ]]` links) +
 * an author/source line, with a star and a delete. Text/author are locally
 * controlled and saved debounced (plus on blur); external (synced) changes
 * reconcile only while unfocused so they never yank the caret mid-edit.
 */
export function QuoteCard({ quote, autoFocus = false }: { quote: Quote; autoFocus?: boolean }) {
  const [text, setText] = useState(quote.text);
  const [author, setAuthor] = useState(quote.author);
  const { focusedRef, schedule, flush } = useDebouncedSave();

  // Reconcile remote changes only when the user isn't editing this card.
  useEffect(() => {
    if (focusedRef.current) return;
    setText(quote.text);
    setAuthor(quote.author);
  }, [quote.text, quote.author, focusedRef]);

  const persist = (nextText: string, nextAuthor: string) => {
    void updateQuote(quote.id, { text: nextText, author: nextAuthor });
    void reconcileEntityRefs(quote.id, [nextText]);
  };

  const scheduleSave = (nextText: string, nextAuthor: string) => schedule(() => persist(nextText, nextAuthor));
  const flushSave = () => flush(() => persist(text, author));

  return (
    <div className="group relative rounded-2xl border border-border/65 bg-card/60 p-5 transition-colors focus-within:border-border sm:p-6">
      {/* Top bar: quote glyph (left) + actions (right), mirroring the bookmark card. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-lg bg-muted/50 pt-1.5 font-serif text-2xl leading-none text-muted-foreground/60" aria-hidden>
          &ldquo;
        </span>

        <div className="flex items-center gap-0.5">
          <EventLogNow subjectId={quote.id} subjectKind="quote" variant="icon" />
          <button
            type="button"
            onClick={() => void toggleFavorite(quote.id)}
            aria-label={quote.favorite ? "Unstar quote" : "Star quote"}
            aria-pressed={quote.favorite}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-accent",
              quote.favorite ? "text-amber-500" : "text-muted-foreground hover:text-amber-500",
            )}
          >
            <Star className={cn("h-4 w-4", quote.favorite && "fill-current")} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More actions"
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none"
            >
              <Ellipsis className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem variant="destructive" onClick={() => void deleteQuote(quote.id)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <RefField
        value={text}
        autoFocus={autoFocus}
        excludeId={quote.id}
        ariaLabel="Quote text"
        placeholder="Write a quote…"
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(v) => {
          setText(v);
          scheduleSave(v, author);
        }}
        onBlur={flushSave}
        className="w-full bg-transparent font-serif text-lg leading-relaxed text-foreground"
      />
      <div className="mt-1 flex items-center gap-1.5">
        <span className="select-none text-muted-foreground">&mdash;</span>
        <input
          value={author}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onChange={(e) => {
            setAuthor(e.target.value);
            scheduleSave(text, e.target.value);
          }}
          onBlur={flushSave}
          placeholder="Author or source"
          className="min-w-0 flex-1 bg-transparent text-sm italic text-muted-foreground outline-none placeholder:text-muted-foreground/40"
        />
      </div>

      <LinkedFrom targetId={quote.id} className="mt-3" />
    </div>
  );
}
