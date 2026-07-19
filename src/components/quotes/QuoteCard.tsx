"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Trash2 } from "lucide-react";

import { useAutosizeTextarea } from "@/hooks/use-autosize-textarea";
import { deleteQuote, toggleFavorite, updateQuote, type Quote } from "@/lib/quotes/quotes";
import { cn } from "@/lib/shared/utils";

const SAVE_DEBOUNCE_MS = 600;

/**
 * A single editable quote: a quote-text field + an author/source line, with a
 * star and a delete. Text/author are locally controlled and saved debounced
 * (plus on blur); external (synced) changes reconcile only while unfocused so
 * they never yank the caret mid-edit.
 */
export function QuoteCard({ quote, autoFocus = false }: { quote: Quote; autoFocus?: boolean }) {
  const [text, setText] = useState(quote.text);
  const [author, setAuthor] = useState(quote.author);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus a freshly-added quote so the user can type straight away.
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile remote changes only when the user isn't editing this card.
  useEffect(() => {
    if (focusedRef.current) return;
    setText(quote.text);
    setAuthor(quote.author);
  }, [quote.text, quote.author]);

  // Grow the quote field to fit its content (recomputes on width/masonry reflow).
  useAutosizeTextarea(textareaRef, text);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const scheduleSave = (nextText: string, nextAuthor: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void updateQuote(quote.id, { text: nextText, author: nextAuthor });
    }, SAVE_DEBOUNCE_MS);
  };

  const flushSave = () => {
    focusedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    void updateQuote(quote.id, { text, author });
  };

  return (
    <div className="group relative rounded-2xl border border-border/65 bg-card/60 p-5 transition-colors focus-within:border-border sm:p-6">
      <div className="flex items-start gap-3">
        <span className="select-none font-serif text-3xl leading-none text-muted-foreground/40" aria-hidden>
          &ldquo;
        </span>
        <div className="min-w-0 flex-1 pr-16">
          <textarea
            ref={textareaRef}
            value={text}
            rows={1}
            onFocus={() => {
              focusedRef.current = true;
            }}
            onChange={(e) => {
              setText(e.target.value);
              scheduleSave(e.target.value, author);
            }}
            onBlur={flushSave}
            placeholder="Write a quote…"
            className="w-full resize-none bg-transparent font-serif text-lg leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
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
        </div>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-0.5">
        {/* Star + delete stay visible so actions are always one click away. */}
        <button
          type="button"
          onClick={() => void deleteQuote(quote.id)}
          aria-label="Delete quote"
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
      </div>
    </div>
  );
}
