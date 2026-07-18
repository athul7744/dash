"use client";

/**
 * One shared block-menu instance for the whole editor. Each block's DOM grip
 * dispatches a BLOCK_MENU_EVENT; this listens, opens the menu at the grip, and
 * runs actions against the block at the reported position. Keeping a single
 * React menu (instead of one per block) is what keeps large pages fast.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { BlockContextMenuContent } from "@/components/notes/BlockContextMenu";
import {
  getBlockContextMenuOptions,
  type BlockContextMenuActionId,
  type BlockContextMenuTextStyle,
} from "@/components/notes/block-context-menu-options";
import type { BlockColorKey } from "@/components/notes/NoteBlockEditorColor";

import {
  moveBlockUp,
  moveBlockDown,
  indentBlock,
  outdentBlock,
  type BlockCommand,
} from "@/lib/notes/editor/block-commands";
import { BLOCK_MENU_EVENT, type BlockMenuEventDetail } from "./blockNodeViewDom";

function textStyleOf(typeName: string | undefined, level: unknown): BlockContextMenuTextStyle | null {
  if (typeName === "heading" && typeof level === "number") return `heading-${level}` as BlockContextMenuTextStyle;
  if (typeName === "paragraph") return "paragraph";
  return null;
}

type MenuState = { pos: number; x: number; y: number; bottom: number } | null;

export function BlockMenuLayer({ editor }: { editor: Editor | null }) {
  const [menu, setMenu] = useState<MenuState>(null);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<BlockMenuEventDetail>).detail;
      setPlacement("above");
      setMenu({ pos: detail.pos, x: detail.x, y: detail.y, bottom: detail.bottom });
    };
    dom.addEventListener(BLOCK_MENU_EVENT, onEvent);
    return () => dom.removeEventListener(BLOCK_MENU_EVENT, onEvent);
  }, [editor]);

  // Flip below when opening above would collide with the editor's top chrome
  // bar (not just the viewport edge).
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const height = menuRef.current.offsetHeight;
    const chromeBottom = document.querySelector("[data-notes-chrome-bar]")?.getBoundingClientRect().bottom ?? 8;
    setPlacement(menu.y - height - 6 < chromeBottom + 4 ? "below" : "above");
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-block-context-menu]") || target?.closest(".note-block-grip")) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!editor || !menu) return null;

  const pos = menu.pos;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "block") return null;

  const first = node.firstChild;
  const textStyle = textStyleOf(first?.type.name, first?.attrs?.level);

  // Sibling context for enabling move/indent/outdent.
  const $inside = editor.state.doc.resolve(pos + 1);
  let depth = $inside.depth;
  while (depth >= 1 && $inside.node(depth).type.name !== "block") depth -= 1;
  const parent = depth >= 1 ? $inside.node(depth - 1) : null;
  const index = depth >= 1 ? $inside.index(depth - 1) : 0;
  const canMoveUp = Boolean(parent && index > 0 && parent.child(index - 1).type.name === "block");
  const canMoveDown = Boolean(parent && index + 1 < parent.childCount && parent.child(index + 1).type.name === "block");
  const canOutdent = Boolean(parent && parent.type.name === "block");

  const runOnBlock = (command: BlockCommand) => {
    // Place a cursor safely inside the block (pos+1 is a node boundary, not
    // inline content), then run the selection-based command.
    editor.commands.command(({ state, tr, dispatch }) => {
      if (dispatch) dispatch(tr.setSelection(TextSelection.near(state.doc.resolve(pos + 1))));
      return true;
    });
    editor.commands.command(({ state, dispatch }) => command(state, dispatch));
  };
  const setContentNode = (name: "paragraph" | "heading", level?: 1 | 2 | 3 | 4 | 5) => {
    // Change the first content node's type directly — no selection needed, and
    // paragraph⇄heading are inline-compatible so setNodeMarkup re-converts any
    // level reliably.
    const contentPos = pos + 1;
    editor.commands.command(({ state, tr, dispatch }) => {
      const contentNode = state.doc.nodeAt(contentPos);
      const type = state.schema.nodes[name];
      if (!contentNode || !type) return false;
      const attrs = name === "heading"
        ? { color: contentNode.attrs.color ?? null, level }
        : { color: contentNode.attrs.color ?? null };
      if (dispatch) dispatch(tr.setNodeMarkup(contentPos, type, attrs));
      return true;
    });
  };

  const handleAction = (actionId: BlockContextMenuActionId) => {
    setMenu(null);
    switch (actionId) {
      case "move-up": return runOnBlock(moveBlockUp);
      case "move-down": return runOnBlock(moveBlockDown);
      case "indent": return runOnBlock(indentBlock);
      case "outdent": return runOnBlock(outdentBlock);
      case "convert-paragraph": return setContentNode("paragraph");
      case "convert-heading-1": return setContentNode("heading", 1);
      case "convert-heading-2": return setContentNode("heading", 2);
      case "convert-heading-3": return setContentNode("heading", 3);
      case "convert-heading-4": return setContentNode("heading", 4);
      case "convert-heading-5": return setContentNode("heading", 5);
      case "delete":
        editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize });
        return;
      default:
        return;
    }
  };

  const handleColorSelect = (color: BlockColorKey | null) => {
    setMenu(null);
    const contentPos = pos + 1;
    editor.commands.command(({ state, tr, dispatch }) => {
      const contentNode = state.doc.nodeAt(contentPos);
      if (!contentNode) return false;
      if (dispatch) dispatch(tr.setNodeMarkup(contentPos, undefined, { ...contentNode.attrs, color }));
      return true;
    });
  };

  const options = getBlockContextMenuOptions({
    blockType: node.attrs.blockType || "text",
    textStyle,
    canMoveUp,
    canMoveDown,
    canIndent: canMoveUp,
    canOutdent,
  });

  return (
    <div
      ref={menuRef}
      data-block-context-menu="true"
      className="fixed z-50 rounded-lg border border-border/70 bg-background p-1 shadow-lg"
      // Open above the block by default; flip below when there's no room above.
      style={
        placement === "above"
          ? { left: menu.x, top: menu.y, transform: "translateY(calc(-100% - 6px))" }
          : { left: menu.x, top: menu.bottom + 6 }
      }
    >
      <BlockContextMenuContent options={options} onAction={handleAction} onColorSelect={handleColorSelect} />
    </div>
  );
}
