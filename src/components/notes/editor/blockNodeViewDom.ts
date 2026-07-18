/**
 * Plain-DOM NodeView for the `block` wrapper.
 *
 * A React NodeView per block is far too heavy at scale (100+ blocks = seconds
 * of mount time). This builds each block's chrome with raw DOM instead — a
 * hover-reveal grip button + the content hole — which is cheap. Clicking the
 * grip dispatches a DOM event that a single shared React menu (BlockMenuLayer)
 * listens for, so there's exactly one menu instance for the whole editor.
 *
 * Block color and heading-sticky styling are applied from the block's first
 * content node and kept in sync via `update()`.
 */

import type { Node as PMNode } from "@tiptap/pm/model";
import type { NodeViewRendererProps } from "@tiptap/core";

export const BLOCK_MENU_EVENT = "note-block-menu";

export interface BlockMenuEventDetail {
  pos: number;
  x: number;
  /** Grip top (viewport coords) — menu anchors above this. */
  y: number;
  /** Grip bottom (viewport coords) — menu anchors below this when flipped. */
  bottom: number;
}

const GRIP_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/>' +
  '<circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>';

function applyBlockStyles(dom: HTMLElement, node: PMNode) {
  const first = node.firstChild;
  const color = first?.attrs?.color as string | undefined;

  // Reset our managed classes, then re-apply.
  dom.classList.forEach((c) => {
    if (c.startsWith("block-color-")) dom.classList.remove(c);
  });
  if (color) dom.classList.add(`block-color-${color}`);
}

export function createBlockNodeView(props: NodeViewRendererProps) {
  const { editor, getPos } = props;
  let node = props.node;

  const dom = document.createElement("div");
  dom.className = "note-block";

  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "note-block-grip";
  grip.setAttribute("contenteditable", "false");
  grip.setAttribute("aria-label", "Block menu");
  grip.innerHTML = GRIP_SVG;
  grip.addEventListener("mousedown", (event) => event.preventDefault()); // keep editor selection
  grip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos == null) return;
    const rect = grip.getBoundingClientRect();
    editor.view.dom.dispatchEvent(
      new CustomEvent<BlockMenuEventDetail>(BLOCK_MENU_EVENT, {
        detail: { pos, x: rect.left, y: rect.top, bottom: rect.bottom },
        bubbles: true,
      }),
    );
  });

  const contentDOM = document.createElement("div");
  contentDOM.className = "note-block-content";

  dom.append(grip, contentDOM);
  applyBlockStyles(dom, node);

  return {
    dom,
    contentDOM,
    update(updated: PMNode) {
      if (updated.type.name !== node.type.name) return false;
      node = updated;
      applyBlockStyles(dom, updated);
      return true;
    },
    // The grip isn't ProseMirror-managed content.
    ignoreMutation(mutation: MutationRecord | { type: string; target: Node }) {
      return grip.contains(mutation.target as Node);
    },
  };
}
