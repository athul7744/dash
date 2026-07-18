/**
 * Native block structural commands for the single-document editor.
 *
 * Blocks nest directly (`block = blockContent+ block*`), so ProseMirror's
 * list-item commands don't apply — these operate on the block tree via
 * transforms. All are plain ProseMirror commands `(state, dispatch) => boolean`
 * so they compose in a keymap and are covered by the native undo history.
 *
 * - splitBlock:  Enter — split the current block at the cursor into two siblings.
 * - indentBlock: Tab — nest the current block as the last child of its previous
 *   sibling block.
 * - outdentBlock: Shift-Tab — lift a nested block to sit after its parent.
 *
 * The stable-id plugin reassigns ids for any block a split clones, so the
 * original block keeps its id/edges and the new one gets a fresh id.
 */

import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Selection } from "@tiptap/pm/state";
import { canSplit, canJoin } from "@tiptap/pm/transform";
import type { ResolvedPos } from "@tiptap/pm/model";

import { BLOCK_NODE_TYPE } from "./block-document";

type Dispatch = (tr: Transaction) => void;
export type BlockCommand = (state: EditorState, dispatch?: Dispatch) => boolean;

/** Depth of the nearest `block` ancestor enclosing the position, or null. */
function blockDepthAt($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    if ($pos.node(depth).type.name === BLOCK_NODE_TYPE) return depth;
  }
  return null;
}

/** Enter: split the current block at the cursor into two sibling blocks. */
export const splitBlock: BlockCommand = (state, dispatch) => {
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  const blockDepth = blockDepthAt($from);
  if (blockDepth === null) return false;

  // Split every level from the textblock up to (and including) the block.
  const depth = $from.depth - blockDepth + 1;
  if (!canSplit(state.doc, $from.pos, depth)) return false;

  if (dispatch) {
    dispatch(state.tr.split($from.pos, depth).scrollIntoView());
  }
  return true;
};

/** Tab: nest the current block under its previous sibling block. */
export const indentBlock: BlockCommand = (state, dispatch) => {
  const { $from } = state.selection;
  const blockDepth = blockDepthAt($from);
  if (blockDepth === null) return false;

  const parentDepth = blockDepth - 1;
  const parent = $from.node(parentDepth);
  const index = $from.index(parentDepth);
  if (index === 0) return false;

  const prev = parent.child(index - 1);
  if (prev.type.name !== BLOCK_NODE_TYPE) return false; // nothing block-shaped to nest under

  const blockStart = $from.before(blockDepth);
  const blockEnd = $from.after(blockDepth);
  const blockNode = $from.node(blockDepth);
  const prevStart = $from.posAtIndex(index - 1, parentDepth);
  const insertInside = prevStart + prev.nodeSize - 1; // just inside prev's closing token

  if (dispatch) {
    const cursorOffset = $from.pos - blockStart;
    const tr = state.tr.delete(blockStart, blockEnd);
    const insertAt = tr.mapping.map(insertInside);
    tr.insert(insertAt, blockNode);
    // Cursor was `cursorOffset` into the block; the block now starts at insertAt.
    tr.setSelection(Selection.near(tr.doc.resolve(insertAt + cursorOffset)));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Shift-Tab: lift a nested block to sit right after its parent block. */
export const outdentBlock: BlockCommand = (state, dispatch) => {
  const { $from } = state.selection;
  const blockDepth = blockDepthAt($from);
  if (blockDepth === null) return false;

  const parentDepth = blockDepth - 1;
  if ($from.node(parentDepth).type.name !== BLOCK_NODE_TYPE) return false; // not nested

  const blockStart = $from.before(blockDepth);
  const blockEnd = $from.after(blockDepth);
  const blockNode = $from.node(blockDepth);
  const parentAfter = $from.after(parentDepth); // position just after the parent block

  if (dispatch) {
    const cursorOffset = $from.pos - blockStart;
    const tr = state.tr.delete(blockStart, blockEnd);
    const insertAt = tr.mapping.map(parentAfter);
    tr.insert(insertAt, blockNode);
    tr.setSelection(Selection.near(tr.doc.resolve(insertAt + cursorOffset)));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * Backspace at the very start of a block:
 *  - nested block → outdent it (lift after its parent);
 *  - otherwise → merge it into the previous sibling block (join the two blocks,
 *    then join the adjacent text so the cursor lands at the seam).
 * Returns false in every other position so default backspace applies.
 */
export const mergeBlockBackward: BlockCommand = (state, dispatch) => {
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;

  const blockDepth = blockDepthAt($from);
  if (blockDepth === null) return false;

  // Only when the cursor is at the start of a textblock that is the block's
  // first, direct child (skip nested content like list items / table cells).
  if ($from.parentOffset !== 0) return false;
  if ($from.depth !== blockDepth + 1) return false;
  if ($from.index(blockDepth) !== 0) return false;

  const parentDepth = blockDepth - 1;

  // Nested block → outdent.
  if ($from.node(parentDepth).type.name === BLOCK_NODE_TYPE) {
    return outdentBlock(state, dispatch);
  }

  // Root block → merge into the previous sibling block.
  const index = $from.index(parentDepth);
  if (index === 0) return false;
  const prev = $from.node(parentDepth).child(index - 1);
  if (prev.type.name !== BLOCK_NODE_TYPE) return false;
  // Concatenating blocks stays schema-valid only when the survivor has no
  // trailing child blocks (content is `blockContent+ block*`).
  if (prev.lastChild?.type.name === BLOCK_NODE_TYPE) return false;

  const boundary = $from.before(blockDepth); // between prev (survivor) and this block
  if (!canJoin(state.doc, boundary)) return false;

  if (dispatch) {
    const tr = state.tr.join(boundary); // merge the two block wrappers
    const innerBoundary = boundary - 1; // seam between the two adjacent textblocks
    if (canJoin(tr.doc, innerBoundary)) {
      tr.join(innerBoundary);
    }
    tr.setSelection(Selection.near(tr.doc.resolve(innerBoundary)));
    dispatch(tr.scrollIntoView());
  }
  return true;
};
