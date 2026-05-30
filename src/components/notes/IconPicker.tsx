"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/shared/utils";
import { SpriteIcon } from "./SpriteIcon";

import iconMetadata from "@/lib/notes/icon-metadata.json";

type IconEntry = { n: string; t: string[]; c: string };

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "faces", label: "Faces" },
  { id: "people", label: "People" },
  { id: "animals", label: "Animals" },
  { id: "food", label: "Food" },
  { id: "nature", label: "Nature" },
  { id: "plants", label: "Plants" },
  { id: "activities", label: "Activities" },
  { id: "travel", label: "Travel" },
  { id: "places", label: "Places" },
  { id: "objects", label: "Objects" },
  { id: "symbols", label: "Symbols" },
  { id: "flags", label: "Flags" },
] as const;

const COLS = 8;
const ROW_HEIGHT = 36; // size-8 (32px) + gap (4px)
const OVERSCAN = 3; // extra rows above/below viewport

const allIcons = iconMetadata as IconEntry[];

// Pre-compute searchable word arrays for prefix matching
const iconSearchIndex = allIcons.map((icon) => ({
  ...icon,
  words: [icon.n, ...icon.t].join(" ").toLowerCase().split(/[\s-]+/),
}));

/** Returns true if every query word is a prefix of at least one icon word. */
function matchesQuery(words: string[], queryWords: string[]): boolean {
  return queryWords.every((qw) => words.some((w) => w.startsWith(qw)));
}

export function IconPicker({
  value,
  onSelect,
  onClear,
}: {
  value?: string | null;
  onSelect: (icon: string) => void;
  onClear?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [scrollTop, setScrollTop] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset scroll when filter changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [query, category]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let results = iconSearchIndex;

    if (category !== "all") {
      results = results.filter((icon) => icon.c === category);
    }

    if (q) {
      const queryWords = q.split(/\s+/);
      results = results.filter((icon) => matchesQuery(icon.words, queryWords));
    }

    return results;
  }, [query, category]);

  const totalRows = Math.ceil(filtered.length / COLS);
  const totalHeight = totalRows * ROW_HEIGHT;
  const viewportHeight = 208; // max-h-52 = 13rem = 208px

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Calculate visible row range
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleIcons = filtered.slice(startRow * COLS, endRow * COLS);

  return (
    <div className="flex w-72 flex-col gap-1.5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search icons..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full rounded-lg border border-border/60 bg-background pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={cn(
              "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
              category === cat.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            onClick={() => setCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Icon grid (virtualized) */}
      <div className="px-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {query ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}` : category === "all" ? `${filtered.length} icons` : CATEGORIES.find((c) => c.id === category)?.label}
      </div>
      <div
        ref={scrollRef}
        className="max-h-52 overflow-y-auto overscroll-contain rounded-md"
        onScroll={handleScroll}
      >
        {filtered.length > 0 ? (
          <div style={{ height: totalHeight, position: "relative" }}>
            <div
              className="grid grid-cols-8 gap-1"
              style={{
                position: "absolute",
                top: startRow * ROW_HEIGHT,
                left: 0,
                right: 0,
              }}
            >
              {visibleIcons.map((icon) => (
                <button
                  key={icon.n}
                  type="button"
                  title={icon.n.replace(/-/g, " ")}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted",
                    value === icon.n ? "bg-accent" : ""
                  )}
                  onClick={() => onSelect(icon.n)}
                >
                  <SpriteIcon name={icon.n} size={20} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-muted-foreground">No icons found</div>
        )}
      </div>

      {/* Clear button */}
      {onClear && value ? (
        <button
          type="button"
          className="flex h-7 items-center justify-center rounded-lg px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClear}
        >
          Remove icon
        </button>
      ) : null}
    </div>
  );
}
