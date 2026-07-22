"use client";

/**
 * Reference autocomplete for any TipTap surface (the notes editor and the cards'
 * RefField). When the caret sits inside an open `[[…` token it lists matching
 * entities across every app, with keyboard nav (↑/↓/Enter/Tab/Esc) intercepted
 * ahead of ProseMirror via a capture-phase listener. Selecting inserts an
 * `entityRef` chip node bound to that entity's id.
 *
 * The menu is portalled to <body> and fixed-positioned at the caret, clamped to
 * the viewport — so it escapes card `overflow-hidden`, stacks above everything,
 * and never pushes the page wider. The five search queries live in the lazily
 * mounted `RefMenuResults` child, so they run only while the menu is open.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";

import { getPageReferenceQuery } from "@/lib/notes/editor-document-helpers";
import { useEntitySearch, type EntitySearchResult } from "@/hooks/use-entity-search";
import { ENTITY_REF_NODE_TYPE } from "@/lib/links/tokens";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

/** Caret position in viewport coordinates (from ProseMirror coordsAtPos). */
type Caret = { left: number; top: number; bottom: number };
const MAX_RESULTS = 8;
const MARGIN = 8;

export function RefMenuLayer({
  editor,
  excludeId,
}: {
  editor: Editor | null;
  /** Entity id to omit from results (the source itself — no self-links). */
  excludeId?: string | null;
}) {
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [query, setQuery] = useState("");
  const [caret, setCaret] = useState<Caret | null>(null);

  const close = useCallback(() => {
    setRange(null);
    setCaret(null);
  }, []);

  // Recompute the [[ query + caret position (viewport coords) from editor state.
  const update = useCallback(() => {
    if (!editor) return;
    const q = getPageReferenceQuery(editor);
    if (!q) {
      close();
      return;
    }
    setRange({ from: q.from, to: q.to });
    setQuery(q.query);
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    setCaret({ left: coords.left, top: coords.top, bottom: coords.bottom });
  }, [editor, close]);

  // Detect the token as the user types. (Editor-scoped — cheap, always on.)
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", update);
    editor.on("focus", update);
    editor.on("blur", close);
    return () => {
      editor.off("transaction", update);
      editor.off("focus", update);
      editor.off("blur", close);
    };
  }, [editor, update, close]);

  // Re-anchor on scroll/resize (rAF-throttled) so the fixed menu follows the
  // caret. Only while a menu is open — otherwise every mounted field would add
  // window listeners that fire on every scroll. Keyed on the open flag (not the
  // range object, which is new each keystroke) so listeners aren't re-added.
  const menuOpen = range !== null;
  useEffect(() => {
    if (!menuOpen) return;
    let raf = 0;
    const onScrollOrResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    // capture:true catches scroll on any ancestor (scroll doesn't bubble).
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [menuOpen, update]);

  if (range === null || !caret || !editor) return null;

  return (
    <RefMenuResults editor={editor} range={range} query={query} caret={caret} excludeId={excludeId} onClose={close} />
  );
}

/** Chip icon in the app's accent, keyed by entity kind. */
function KindIcon({ kind }: { kind: EntitySearchResult["kind"] }) {
  const app = getApp(`${kind}s`);
  const Icon = app.icon;
  return (
    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", app.accent.iconBg)}>
      <Icon className={cn("h-3 w-3", app.accent.iconText)} />
    </span>
  );
}

function RefMenuResults({
  editor,
  range,
  query,
  caret,
  excludeId,
  onClose,
}: {
  editor: Editor;
  range: { from: number; to: number };
  query: string;
  caret: Caret;
  excludeId?: string | null;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indexRef = useRef(0);

  const results = useEntitySearch(query, excludeId);
  const matches = useMemo(() => results.slice(0, MAX_RESULTS), [results]);
  const matchesRef = useRef(matches);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  const safeIndex = matches.length === 0 ? 0 : Math.min(index, matches.length - 1);
  useEffect(() => {
    indexRef.current = safeIndex;
  }, [safeIndex]);
  useEffect(() => {
    itemRefs.current[safeIndex]?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  const insert = useCallback(
    (result: EntitySearchResult | undefined) => {
      if (!result) return;
      editor
        .chain()
        .focus()
        .insertContentAt({ from: range.from, to: range.to }, [
          { type: ENTITY_REF_NODE_TYPE, attrs: { kind: result.kind, id: result.id, label: result.label } },
          { type: "text", text: " " },
        ])
        .run();
      onClose();
    },
    [editor, range, onClose],
  );

  // Intercept nav keys before ProseMirror (capture phase).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
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
  }, [onClose, insert]);

  // Measure, then clamp to the viewport: flip above the caret when there's no
  // room below, and shift left so the menu never runs past the right edge.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const below = caret.bottom + h + MARGIN <= window.innerHeight;
    const top = below ? caret.bottom + 6 : Math.max(MARGIN, caret.top - h - 6);
    const left = Math.min(Math.max(MARGIN, caret.left), Math.max(MARGIN, window.innerWidth - w - MARGIN));
    setBox({ left, top });
  }, [caret, matches]);

  if (typeof document === "undefined") return null;

  const menu = (
    <div
      ref={menuRef}
      data-ref-menu="true"
      className="fixed z-[80] max-h-72 w-72 overflow-y-auto rounded-xl border border-border/60 bg-popover/95 p-1.5 text-popover-foreground shadow-lg backdrop-blur-sm scrollbar-none"
      style={{
        left: box ? box.left : 0,
        top: box ? box.top : 0,
        maxWidth: "calc(100vw - 16px)",
        visibility: box ? "visible" : "hidden",
      }}
    >
      <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Link to
      </div>
      {matches.length === 0 ? (
        <div className="px-2 py-3 text-center text-xs text-muted-foreground">No matches found.</div>
      ) : (
        matches.map((result, i) => (
          <button
            key={`${result.kind}:${result.id}`}
            type="button"
            ref={(element) => {
              itemRefs.current[i] = element;
            }}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setIndex(i)}
            onClick={() => insert(result)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] leading-5 outline-none",
              i === safeIndex ? "bg-muted/80 text-foreground" : "text-foreground/95 hover:bg-muted/50",
            )}
          >
            <KindIcon kind={result.kind} />
            <span className="min-w-0 flex-1 truncate font-medium">{result.label}</span>
            {result.sublabel ? (
              <span className="shrink-0 truncate text-[11px] text-muted-foreground">{result.sublabel}</span>
            ) : null}
          </button>
        ))
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
