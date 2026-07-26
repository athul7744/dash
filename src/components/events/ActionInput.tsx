"use client";

import { useMemo, useRef, useState } from "react";

import { useActionVocabulary } from "@/hooks/use-events";
import { caseKey, rankActionMatches } from "@/lib/events/actions";
import { cn } from "@/lib/shared/utils";

/**
 * A text field for an occurrence's "action" (what happened) with three local,
 * zero-dep behaviours: typeahead reuse of existing actions, silent case/whitespace
 * dedup (snap on blur when the case-key matches), and fuzzy "did you mean" typo
 * suggestions. Stem/fuzzy matches are only *offered* — never auto-applied, so the
 * user's tense/word is never rewritten. It renders its own positioned dropdown
 * (not a Popover) so it works inside the existing log/edit popovers.
 */
export function ActionInput({
  value,
  onChange,
  placeholder = "What happened? (optional)",
  autoFocus,
  variant = "field",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** "field" = bordered inline input; "plain" = borderless, prominent (Compose). */
  variant?: "field" | "plain";
  className?: string;
}) {
  const vocab = useActionVocabulary();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = useMemo(() => {
    const ranked = rankActionMatches(value, vocab).slice(0, 8);
    const trimmed = value.trim();
    const hasExact = ranked.some((r) => r.kind === "exact");
    const list = ranked.map((r) => ({ value: r.entry.display, hint: r.kind === "didYouMean" ? "did you mean?" : "", count: r.entry.count }));
    if (trimmed && !hasExact) list.push({ value: trimmed, hint: "new", count: -1 });
    return list;
  }, [value, vocab]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setActive(-1);
  };

  const snapOnBlur = () => {
    const hit = vocab.find((e) => e.caseKey === caseKey(value));
    if (hit && hit.display !== value) onChange(hit.display);
  };

  return (
    <div className="relative">
      <input
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          variant === "plain"
            ? "w-full bg-transparent text-[17px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            : "w-full rounded-md border border-border/60 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-violet-500",
          className,
        )}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          // Defer so a row's click (which we also preventDefault) resolves first.
          blurTimer.current = setTimeout(() => {
            snapOnBlur();
            setOpen(false);
            setActive(-1);
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, rows.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && active >= 0 && active < rows.length) {
              e.preventDefault();
              e.stopPropagation(); // don't submit the parent log form
              pick(rows[active].value);
            } else {
              setOpen(false);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {open && rows.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover py-1 text-xs shadow-md">
          {rows.map((row, i) => (
            <li key={`${row.value}-${row.hint}`}>
              <button
                type="button"
                // preventDefault keeps input focus so this click resolves before blur.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(row.value)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                  i === active ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/60",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {row.hint === "new" ? (
                    <>
                      Use <span className="font-medium">&ldquo;{row.value}&rdquo;</span>
                    </>
                  ) : (
                    row.value
                  )}
                </span>
                {row.hint === "did you mean?" ? (
                  <span className="shrink-0 text-[11px] text-violet-500 dark:text-violet-400">did you mean?</span>
                ) : row.count > 0 ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground/60">{row.count}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
