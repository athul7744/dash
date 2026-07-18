"use client";

/**
 * Shared table controls for the single-document editor. When the selection is
 * inside a table, a floating "Table options" button appears pinned to the
 * current row; its menu adds/deletes columns and rows or deletes the table.
 *
 * One instance for the whole editor (like BlockMenuLayer), positioned within
 * the editor surface container passed via `containerRef`. The helpers are
 * copied from the legacy per-block editor and go away with it at cutover.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection, findCellPos } from "prosemirror-tables";
import { Minus, Plus, Rows3, Trash2 } from "lucide-react";

type ToolbarState = {
  visible: boolean;
  canAddColumn: boolean;
  canDeleteColumn: boolean;
  canAddRow: boolean;
  canDeleteRow: boolean;
  canDeleteTable: boolean;
};

type ToolbarPosition = { top: number; right: number };

const HIDDEN: ToolbarState = {
  visible: false,
  canAddColumn: false,
  canDeleteColumn: false,
  canAddRow: false,
  canDeleteRow: false,
  canDeleteTable: false,
};

function getToolbarState(editor: Editor): ToolbarState {
  if (!editor.isActive("table")) return HIDDEN;
  const canDeleteColumn = editor.can().deleteColumn();
  const canDeleteRow = editor.can().deleteRow();
  return {
    visible: editor.isFocused,
    canAddColumn: true,
    canDeleteColumn,
    canAddRow: true,
    canDeleteRow,
    canDeleteTable: true,
  };
}

function getToolbarPosition(editor: Editor, container: HTMLElement | null): ToolbarPosition | null {
  if (!container || !editor.isActive("table")) return null;

  // domAtPos resolves ANY position (including an in-text cursor) to a DOM node;
  // nodeDOM only works at node boundaries, so it returns null for a cell cursor.
  const { node } = editor.view.domAtPos(editor.state.selection.from);
  const element = node instanceof HTMLElement ? node : node.parentElement;
  const rowElement = element?.closest("tr");
  if (!(rowElement instanceof HTMLElement)) return null;

  const containerRect = container.getBoundingClientRect();
  const rowRect = rowElement.getBoundingClientRect();
  return {
    top: rowRect.top - containerRect.top + rowRect.height / 2,
    right: Math.max(containerRect.right - rowRect.right + 8, 8),
  };
}

function getFocusedCellPos(editor: Editor): number | null {
  if (!editor.isActive("table")) return null;
  const { doc, selection } = editor.state;
  if (selection instanceof CellSelection) return selection.$headCell.pos;
  try {
    return findCellPos(doc, selection.head)?.pos ?? null;
  } catch {
    return null;
  }
}

function runAtFocusedCell(editor: Editor, cellPos: number | null, action: () => boolean) {
  const pos = cellPos ?? getFocusedCellPos(editor);
  if (pos !== null) {
    // Put a text cursor in the target cell so prosemirror-tables commands
    // operate on the right column/row.
    const $cell = editor.state.doc.resolve(pos);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near($cell)));
    editor.view.focus();
  } else {
    editor.commands.focus();
  }
  return action();
}

const MENU_ITEM_CLASS =
  "group/dropdown-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

export function TableToolbarLayer({
  editor,
  containerRef,
}: {
  editor: Editor | null;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [state, setState] = useState<ToolbarState>(HIDDEN);
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const menuOpenRef = useRef(false);
  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const focusedCellPosRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (editor.isFocused && editor.isActive("table")) {
        focusedCellPosRef.current = getFocusedCellPos(editor);
      }
      setState(getToolbarState(editor));
      // Keep the toolbar pinned to the trigger row while its menu is open.
      if (menuOpenRef.current) return;
      const next = getToolbarPosition(editor, containerRef.current);
      if (next) setPosition(next);
    };
    editor.on("transaction", update);
    editor.on("focus", update);
    editor.on("blur", update);
    return () => {
      editor.off("transaction", update);
      editor.off("focus", update);
      editor.off("blur", update);
    };
  }, [editor, containerRef]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (!editor || position === null || (!state.visible && !menuOpen)) return null;

  const act = (action: () => boolean) => {
    runAtFocusedCell(editor, focusedCellPosRef.current, action);
    setMenuOpen(false);
  };

  return (
    <div
      className={`absolute z-10 -translate-y-1/2 transition-opacity duration-150 ${
        menuOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0 group-focus-within/note-editor:pointer-events-auto group-focus-within/note-editor:opacity-100 md:group-hover/note-editor:pointer-events-auto md:group-hover/note-editor:opacity-100"
      }`}
      style={{ top: `${position.top}px`, right: `${position.right}px` }}
    >
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          title="Table options"
          aria-label="Table options"
          className="inline-flex size-7 items-center justify-center rounded-md border border-border/50 bg-card/95 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onMouseDown={(event) => {
            focusedCellPosRef.current = getFocusedCellPos(editor);
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          <Rows3 className="h-3.5 w-3.5" />
        </button>
        {menuOpen ? (
          <div
            ref={panelRef}
            data-slot="dropdown-menu-content"
            className="absolute top-[calc(100%+0.375rem)] right-0 z-20 w-44 min-w-32 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <button type="button" disabled={!state.canAddColumn} className={MENU_ITEM_CLASS} onClick={() => act(() => editor.commands.addColumnAfter())}>
              <Plus className="h-3.5 w-3.5" />
              Add column
            </button>
            <button type="button" disabled={!state.canDeleteColumn} className={MENU_ITEM_CLASS} onClick={() => act(() => editor.commands.deleteColumn())}>
              <Minus className="h-3.5 w-3.5" />
              Delete column
            </button>
            <div className="my-1 h-px bg-border/70" />
            <button type="button" disabled={!state.canAddRow} className={MENU_ITEM_CLASS} onClick={() => act(() => editor.commands.addRowAfter())}>
              <Plus className="h-3.5 w-3.5" />
              Add row
            </button>
            <button type="button" disabled={!state.canDeleteRow} className={MENU_ITEM_CLASS} onClick={() => act(() => editor.commands.deleteRow())}>
              <Minus className="h-3.5 w-3.5" />
              Delete row
            </button>
            <div className="my-1 h-px bg-border/70" />
            <button
              type="button"
              disabled={!state.canDeleteTable}
              className={`${MENU_ITEM_CLASS} text-destructive focus:bg-destructive/10 focus:text-destructive`}
              onClick={() => act(() => editor.commands.deleteTable())}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete table
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
