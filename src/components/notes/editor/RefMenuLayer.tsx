"use client";

/**
 * Page-reference autocomplete for the single-document editor. When the caret
 * sits inside an open `[[…` token it lists matching page titles anchored at the
 * caret, with keyboard nav (↑/↓/Enter/Tab/Esc) intercepted ahead of ProseMirror
 * via a capture-phase listener — mirroring SlashMenuLayer. Selecting inserts a
 * `[[Title]]` reference. One instance per editor.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/core";

import { getPageReferenceQuery } from "@/lib/notes/editor-document-helpers";
import { SpriteIcon } from "@/components/notes/SpriteIcon";

type Caret = { left: number; top: number; bottom: number; viewportBottom: number };
const MAX_RESULTS = 8;

export function RefMenuLayer({
  editor,
  containerRef,
  pageTitles,
  emojiByTitle,
}: {
  editor: Editor | null;
  containerRef: RefObject<HTMLElement | null>;
  pageTitles: string[];
  emojiByTitle?: Record<string, string | null>;
}) {
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [query, setQuery] = useState("");
  const [caret, setCaret] = useState<Caret | null>(null);
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indexRef = useRef(0);
  const prevQueryRef = useRef<string | null>(null);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const close = useCallback(() => {
    prevQueryRef.current = null;
    setRange(null);
    setCaret(null);
  }, []);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pool = normalized ? pageTitles.filter((t) => t.toLowerCase().includes(normalized)) : pageTitles;
    return pool.slice(0, MAX_RESULTS);
  }, [pageTitles, query]);
  const matchesRef = useRef(matches);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  // Track the [[ query + caret position from editor state.
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const q = getPageReferenceQuery(editor);
      if (!q) {
        close();
        return;
      }
      // Reset the highlight whenever the query text changes.
      if (q.query !== prevQueryRef.current) {
        prevQueryRef.current = q.query;
        setIndex(0);
      }
      setRange({ from: q.from, to: q.to });
      setQuery(q.query);
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      setCaret({
        left: coords.left - rect.left,
        top: coords.top - rect.top,
        bottom: coords.bottom - rect.top,
        viewportBottom: coords.bottom,
      });
    };
    editor.on("transaction", update);
    editor.on("focus", update);
    editor.on("blur", close);
    return () => {
      editor.off("transaction", update);
      editor.off("focus", update);
      editor.off("blur", close);
    };
  }, [editor, close, containerRef]);

  // Keep the highlighted item visible as arrows move through the list.
  useEffect(() => {
    itemRefs.current[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const insert = useCallback(
    (title: string | undefined) => {
      if (!editor || !range || !title) return;
      editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, `[[${title}]]`).run();
      close();
    },
    [editor, range, close],
  );

  // Intercept nav keys before ProseMirror (capture phase).
  useEffect(() => {
    if (range === null) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      const list = matchesRef.current;
      if (list.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => (i + 1) % list.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => (i - 1 + list.length) % list.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        insert(list[indexRef.current]);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [range, close, insert]);

  // Flip above the caret when there isn't room below.
  useLayoutEffect(() => {
    if (!caret || !menuRef.current) return;
    const height = menuRef.current.offsetHeight;
    setPlacement(caret.viewportBottom + height + 8 > window.innerHeight ? "above" : "below");
  }, [caret, matches]);

  if (range === null || !caret) return null;

  return (
    <div
      ref={menuRef}
      data-ref-menu="true"
      className="absolute z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-border/60 bg-popover/95 p-1.5 text-popover-foreground shadow-lg backdrop-blur-sm scrollbar-none"
      style={
        placement === "below"
          ? { left: caret.left, top: caret.bottom + 6 }
          : { left: caret.left, top: caret.top - 6, transform: "translateY(-100%)" }
      }
    >
      <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Link to page
      </div>
      {matches.length === 0 ? (
        <div className="px-2 py-3 text-center text-xs text-muted-foreground">No pages found.</div>
      ) : (
        matches.map((title, i) => {
          const emoji = emojiByTitle?.[title.toLocaleLowerCase()] ?? null;
          return (
            <button
              key={title}
              type="button"
              ref={(element) => {
                itemRefs.current[i] = element;
              }}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setIndex(i)}
              onClick={() => insert(title)}
              className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] leading-5 outline-none ${
                i === index ? "bg-muted/80 text-foreground" : "text-foreground/95 hover:bg-muted/50"
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {emoji ? (
                  <SpriteIcon name={emoji} size={16} />
                ) : (
                  <span className="text-[11px] text-muted-foreground">[[</span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
