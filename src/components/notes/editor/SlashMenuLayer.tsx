"use client";

/**
 * Shared slash-command menu for the single-document editor. Watches the caret;
 * when a `/query` is typed at a block start it opens a menu anchored to the
 * caret, with keyboard nav (↑/↓/Enter/Tab/Esc) intercepted ahead of ProseMirror
 * via a capture-phase listener. One instance per editor (like BlockMenuLayer).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/core";

import {
  createDateDocument,
  getFilteredSlashCommands,
  getGroupedSlashCommands,
  type SlashCommand,
  type SlashScope,
} from "@/components/notes/NoteBlockEditorSlash";
import { applySlashCommand, getSlashContext, type SlashContext } from "@/lib/notes/editor/slash-single";
import { Calendar } from "@/components/ui/calendar";

// left/top are container-relative (for absolute positioning); viewportBottom is
// the caret's viewport y, used only to decide whether to flip above.
type Caret = { left: number; top: number; bottom: number; viewportBottom: number };

// Soft per-section accent for the menu icon (the app is otherwise monochrome).
const SECTION_ICON_ACCENT: Record<string, string> = {
  basic: "text-foreground/55",
  structure: "text-sky-500 dark:text-sky-400",
  media: "text-teal-500 dark:text-teal-400",
  dates: "text-slate-500 dark:text-slate-400",
  advanced: "text-violet-500 dark:text-violet-400",
};

// Swatch fill per block-color command — the saturated hues from the
// `.block-color-*` rules in globals.css (readable on both themes).
const COLOR_SWATCH: Record<string, string> = {
  gray: "oklch(0.75 0.02 250)",
  brown: "oklch(0.65 0.08 50)",
  orange: "oklch(0.78 0.12 55)",
  yellow: "oklch(0.85 0.12 90)",
  green: "oklch(0.72 0.12 155)",
  blue: "oklch(0.68 0.10 240)",
  purple: "oklch(0.68 0.12 295)",
  pink: "oklch(0.72 0.12 345)",
};

export function SlashMenuLayer({
  editor,
  containerRef,
  scope = "all",
}: {
  editor: Editor | null;
  containerRef: RefObject<HTMLElement | null>;
  /** Restrict the offered commands; the journal uses "dates" (date actions only). */
  scope?: SlashScope;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [caret, setCaret] = useState<Caret | null>(null);
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  // Open when the user chooses "Pick a date…": a calendar anchored at the caret
  // that inserts the chosen date into the block the slash was typed in.
  const [datePicker, setDatePicker] = useState<{ command: SlashCommand; ctx: SlashContext; left: number; top: number } | null>(null);
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indexRef = useRef(0);
  const prevQueryRef = useRef<string | null>(null);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Grouped commands drive the render; `flat` is the SAME list flattened in
  // section order. Keyboard nav, apply, and hover all index into `flat`, so the
  // highlighted row always matches what Enter/click actually runs (raw array
  // order and grouped order diverge — e.g. math-block is declared last but sits
  // in the "structure" group).
  const grouped = useMemo(
    () => (query === null ? [] : getGroupedSlashCommands(getFilteredSlashCommands(query, scope))),
    [query, scope],
  );
  const flat = useMemo(() => grouped.flatMap((section) => section.commands), [grouped]);

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
      if (!ctx) {
        close();
        return;
      }
      // "Pick a date…" opens a calendar instead of inserting immediately. The
      // slash text stays in the block (doc unchanged) so `ctx` is still valid
      // when a date is chosen.
      if (command.custom === "date-picker") {
        setDatePicker({ command, ctx, left: caret?.left ?? 0, top: caret?.bottom ?? 0 });
        close();
        return;
      }
      applySlashCommand(editor, command, ctx);
      close();
    },
    [editor, close, caret],
  );

  const pickDate = useCallback(
    (date: Date | undefined) => {
      if (editor && datePicker && date) {
        applySlashCommand(
          editor,
          { ...datePicker.command, createContent: () => createDateDocument(date) },
          datePicker.ctx,
        );
      }
      setDatePicker(null);
      editor?.commands.focus();
    },
    [editor, datePicker],
  );

  // Dismiss the date picker on Escape or an outside click.
  useEffect(() => {
    if (!datePicker) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDatePicker(null);
        editor?.commands.focus();
      }
    };
    const onDown = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setDatePicker(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [datePicker, editor]);

  // Intercept nav keys before ProseMirror (capture phase).
  useEffect(() => {
    if (query === null) return;
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
  }, [query, close, apply, flat]);

  // Flip above the caret when there isn't room below (uses viewport y).
  useLayoutEffect(() => {
    if (!caret || !menuRef.current) return;
    const height = menuRef.current.offsetHeight;
    setPlacement(caret.viewportBottom + height + 8 > window.innerHeight ? "above" : "below");
  }, [caret, query]);

  if (datePicker) {
    return (
      <div
        ref={datePickerRef}
        data-slash-date-picker="true"
        className="absolute z-50 rounded-xl border border-border/60 bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur-sm"
        style={{ left: datePicker.left, top: datePicker.top + 6 }}
      >
        <Calendar mode="single" autoFocus onSelect={pickDate} />
      </div>
    );
  }

  if (query === null || !caret) return null;

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
        <div className="px-2 py-3 text-center text-xs text-muted-foreground">
          {scope === "dates" ? "No dates found." : "No blocks found."}
        </div>
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
                  title={command.description}
                  ref={(element) => {
                    itemRefs.current[itemIndex] = element;
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setIndex(itemIndex)}
                  onClick={() => apply(command)}
                  className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] leading-5 outline-none ${
                    active ? "bg-muted/80 text-foreground" : "text-foreground/95 hover:bg-muted/50"
                  }`}
                >
                  {command.section === "color" ? (
                    command.id === "color-none" ? (
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-muted-foreground/60" />
                    ) : (
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: COLOR_SWATCH[command.id.replace("color-", "")] }}
                      />
                    )
                  ) : (
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${SECTION_ICON_ACCENT[command.section] ?? "text-muted-foreground"}`} />
                  )}
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
