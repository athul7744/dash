"use client";

/**
 * Shared slash-command menu for the single-document editor. Watches the caret;
 * when a `/query` is typed at a block start it opens a menu anchored to the
 * caret, with keyboard nav (↑/↓/Enter/Tab/Esc) intercepted ahead of ProseMirror
 * via a capture-phase listener. One instance per editor (like BlockMenuLayer).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/core";

import {
  getFilteredSlashCommands,
  getGroupedSlashCommands,
  type SlashCommand,
} from "@/components/notes/NoteBlockEditorSlash";
import { applySlashCommand, getSlashContext } from "@/lib/notes/editor/slash-single";

// left/top are container-relative (for absolute positioning); viewportBottom is
// the caret's viewport y, used only to decide whether to flip above.
type Caret = { left: number; top: number; bottom: number; viewportBottom: number };

export function SlashMenuLayer({
  editor,
  containerRef,
}: {
  editor: Editor | null;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [query, setQuery] = useState<string | null>(null);
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

  // Keep the highlighted command visible as arrows move through the list.
  useEffect(() => {
    itemRefs.current[index]?.scrollIntoView({ block: "nearest" });
  }, [index, query]);

  const close = useCallback(() => {
    prevQueryRef.current = null;
    setQuery(null);
    setCaret(null);
  }, []);

  // Track the slash query + caret position from editor state.
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const ctx = getSlashContext(editor);
      if (!ctx) {
        close();
        return;
      }
      // Reset the highlight whenever the query text changes.
      if (ctx.query !== prevQueryRef.current) {
        prevQueryRef.current = ctx.query;
        setIndex(0);
      }
      setQuery(ctx.query);
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };
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

  const apply = useCallback(
    (command: SlashCommand | undefined) => {
      if (!editor || !command) return;
      const ctx = getSlashContext(editor);
      if (ctx) applySlashCommand(editor, command, ctx);
      close();
    },
    [editor, close],
  );

  // Intercept nav keys before ProseMirror (capture phase).
  useEffect(() => {
    if (query === null) return;
    const flat = getFilteredSlashCommands(query);
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (flat.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => (i + 1) % flat.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => (i - 1 + flat.length) % flat.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        apply(flat[indexRef.current]);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [query, close, apply]);

  // Flip above the caret when there isn't room below (uses viewport y).
  useLayoutEffect(() => {
    if (!caret || !menuRef.current) return;
    const height = menuRef.current.offsetHeight;
    setPlacement(caret.viewportBottom + height + 8 > window.innerHeight ? "above" : "below");
  }, [caret, query]);

  if (query === null || !caret) return null;

  const filtered = getFilteredSlashCommands(query);
  const grouped = getGroupedSlashCommands(filtered);

  let flatIndex = -1;
  return (
    <div
      ref={menuRef}
      data-slash-menu="true"
      className="absolute z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-border/60 bg-popover/95 p-1.5 text-popover-foreground shadow-lg backdrop-blur-sm scrollbar-none"
      style={
        placement === "below"
          ? { left: caret.left, top: caret.bottom + 6 }
          : { left: caret.left, top: caret.top - 6, transform: "translateY(-100%)" }
      }
    >
      {grouped.length === 0 ? (
        <div className="px-2 py-3 text-center text-xs text-muted-foreground">No blocks found.</div>
      ) : (
        grouped.map((section) => (
          <div key={section.id} className="mb-1 last:mb-0">
            <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {section.title}
            </div>
            {section.commands.map((command) => {
              flatIndex += 1;
              const active = flatIndex === index;
              const Icon = command.icon;
              const itemIndex = flatIndex;
              return (
                <button
                  key={command.id}
                  type="button"
                  ref={(element) => {
                    itemRefs.current[itemIndex] = element;
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setIndex(filtered.indexOf(command))}
                  onClick={() => apply(command)}
                  className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] leading-5 outline-none ${
                    active ? "bg-muted/80 text-foreground" : "text-foreground/95 hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{command.title}</span>
                  <span className="shrink-0 text-[10px] tracking-[0.12em] text-muted-foreground">{command.shortcut}</span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
