/**
 * Native block structural commands for the single-document editor.
 *
 * Blocks nest directly (`block = blockContent+ block*`), so ProseMirror's
 * list-item commands don't apply — these operate on the block tree via
 * transforms. All are plain ProseMirror commands `(state, dispatch) => boolean`
 * so they compose in a keymap and are covered by the native undo history.
 *
 * Enter/Backspace only act on a block's own paragraph/heading "line". When the
 * cursor is in a code block, table, task list, or blockquote, the commands
 * return false so those nodes keep their native ProseMirror behavior (newline
 * in code, new table row, new task item, lift-out of a quote, …).
 *
 * The stable-id plugin reassigns ids for any block a split clones, so the
 * original block keeps its id/edges and the new one gets a fresh id.
 */

import type { EditorState, Transaction } from "@tiptap/pm/state";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

import { BLOCK_NODE_TYPE } from "./block-document";

type Dispatch = (tr: Transaction) => void;
export type BlockCommand = (state: EditorState, dispatch?: Dispatch) => boolean;

const LINE_TYPES = new Set(["paragraph", "heading"]);
// Content nodes that hold multiple inner lines/items (task list items, quote
// lines). Their block-level enter/backspace exits need explicit handling because
// native list/quote lift commands misbehave inside the `block` wrapper.
const WRAPPER_TYPES = new Set(["taskList", "blockquote"]);

/** Depth of the nearest `block` ancestor enclosing the position, or null. */
function blockDepthAt($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    if ($pos.node(depth).type.name === BLOCK_NODE_TYPE) return depth;
  }
  return null;
}

type WrapperInfo = {
  wrapper: PMNode;
  wrapperPos: number; // position before the wrapper content node
  item: PMNode; // the inner item (taskItem) or line (paragraph in a quote)
  itemDepth: number;
  itemIndex: number; // index of the item within the wrapper
  childCount: number; // number of items/lines in the wrapper
  singleLine: boolean; // the wrapper effectively holds one text line
};

/** Describe a taskList/blockquote content node the cursor sits inside, or null. */
function wrapperInfoAt($from: ResolvedPos, blockDepth: number): WrapperInfo | null {
  const wrapper = $from.node(blockDepth + 1);
  if (!wrapper || !WRAPPER_TYPES.has(wrapper.type.name)) return null;
  if ($from.depth < blockDepth + 2) return null;
  const itemDepth = blockDepth + 2;
  const item = $from.node(itemDepth);
  const childCount = wrapper.childCount;
  const singleLine = childCount === 1 && (wrapper.type.name === "blockquote" || item.childCount === 1);
  return {
    wrapper,
    wrapperPos: $from.before(blockDepth + 1),
    item,
    itemDepth,
    itemIndex: $from.index(blockDepth + 1),
    childCount,
    singleLine,
  };
}

/**
 * Enter inside a task list / blockquote. Only the exit cases are handled here;
 * a non-empty item returns false so native splitListItem / split creates the
 * next item or quote line.
 *  - empty single-item wrapper → convert the block to an empty paragraph (exit);
 *  - empty last item of many → drop it and open a new empty block after;
 *  - empty middle item → native (new item).
 */
function wrapperEnter(state: EditorState, dispatch: Dispatch | undefined, $from: ResolvedPos, blockDepth: number): boolean {
  const info = wrapperInfoAt($from, blockDepth);
  if (!info) return false;

  if ($from.parent.content.size !== 0) {
    // Non-empty line. A blockquote needs an explicit paragraph split — Tiptap's
    // core splitBlock fallback throws inside the block wrapper. Task lists defer
    // to the native splitListItem handler (which works).
    if (info.wrapper.type.name === "blockquote" && canSplit(state.doc, $from.pos, 1)) {
      if (dispatch) dispatch(state.tr.split($from.pos, 1).scrollIntoView());
      return true;
    }
    return false;
  }

  const paragraph = state.schema.nodes.paragraph;
  const blockType = state.schema.nodes[BLOCK_NODE_TYPE];

  if (info.childCount === 1) {
    if (dispatch) {
      const tr = state.tr.replaceWith(info.wrapperPos, info.wrapperPos + info.wrapper.nodeSize, paragraph.create());
      tr.setSelection(TextSelection.near(tr.doc.resolve(info.wrapperPos + 1)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  if (info.itemIndex === info.childCount - 1) {
    if (dispatch) {
      const itemStart = $from.before(info.itemDepth);
      const blockEnd = $from.after(blockDepth);
      const tr = state.tr.delete(itemStart, itemStart + info.item.nodeSize);
      const insertAt = tr.mapping.map(blockEnd);
      tr.insert(insertAt, blockType.create({ blockId: null, blockType: "text" }, paragraph.create()));
      tr.setSelection(Selection.near(tr.doc.resolve(insertAt + 2)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  return false; // middle empty item → native new item
}

/**
 * Backspace at the start of a single-line task list / blockquote block: unwrap
 * it into a plain paragraph (keeping any text). Multi-item wrappers fall through
 * to native (merge within the list). This is what converts an empty/one-line
 * checkbox or quote back to normal text.
 */
function wrapperBackspace(state: EditorState, dispatch: Dispatch | undefined, $from: ResolvedPos, blockDepth: number): boolean {
  if ($from.parentOffset !== 0) return false;
  const info = wrapperInfoAt($from, blockDepth);
  if (!info || !info.singleLine) return false;

  if (dispatch) {
    const paragraph = state.schema.nodes.paragraph;
    const tr = state.tr.replaceWith(
      info.wrapperPos,
      info.wrapperPos + info.wrapper.nodeSize,
      paragraph.create(null, $from.parent.content),
    );
    tr.setSelection(TextSelection.near(tr.doc.resolve(info.wrapperPos + 1)));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

function hasChildBlocks(block: PMNode): boolean {
  return block.childCount > 1 && block.lastChild?.type.name === BLOCK_NODE_TYPE;
}

/** Resolved position at the end of the text line immediately before `pos`. */
function previousLinePos(doc: PMNode, pos: number): ResolvedPos | null {
  const near = Selection.near(doc.resolve(pos), -1);
  const $head = (near as { $head?: ResolvedPos }).$head;
  return $head ?? null;
}

/** Insert a fresh empty paragraph block right after the block at `blockDepth`. */
function insertBlockAfter(state: EditorState, dispatch: Dispatch | undefined, $pos: ResolvedPos, blockDepth: number): boolean {
  const blockType = state.schema.nodes[BLOCK_NODE_TYPE];
  const paragraph = state.schema.nodes.paragraph;
  const insertAt = $pos.after(blockDepth);
  if (dispatch) {
    const tr = state.tr.insert(insertAt, blockType.create({ blockId: null, blockType: "text" }, paragraph.create()));
    tr.setSelection(Selection.near(tr.doc.resolve(insertAt + 2)));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

/** Enter: split the current block's line at the cursor into a new block. */
export const splitBlock: BlockCommand = (state, dispatch) => {
  const { selection, schema } = state;

  // Enter on a selected atom line (divider / image) → new empty block after it.
  if (selection instanceof NodeSelection) {
    const $pos = selection.$from;
    const atomBlockDepth = blockDepthAt($pos);
    if (atomBlockDepth !== null && $pos.depth === atomBlockDepth) {
      return insertBlockAfter(state, dispatch, $pos, atomBlockDepth);
    }
    return false;
  }

  if (!selection.empty) return false;
  const { $from } = selection;

  const blockDepth = blockDepthAt($from);
  if (blockDepth === null) return false;
  // Task list / blockquote exits (empty item → exit); non-empty falls through.
  if (wrapperEnter(state, dispatch, $from, blockDepth)) return true;
  // Only a cursor directly in the block's own line (skip code/table/quote/task).
  if ($from.depth !== blockDepth + 1) return false;
  const line = $from.parent;
  if (!LINE_TYPES.has(line.type.name)) return false;

  const block = $from.node(blockDepth);
  const paragraph = schema.nodes.paragraph;
  const blockType = schema.nodes[BLOCK_NODE_TYPE];

  const lineEnd = $from.end();
  const cursor = $from.pos;
  const atStart = cursor === $from.start();
  const atEnd = cursor === lineEnd;
  const hasChildren = hasChildBlocks(block);

  const contentNodeEnd = $from.before() + line.nodeSize; // just after the line node
  const blockEnd = $from.after(blockDepth);

  if (dispatch) {
    const tr = state.tr;

    // Enter at the very start of a non-empty line: push an empty block above and
    // keep the current block (id + content) untouched. Selection maps forward.
    if (atStart && line.content.size > 0) {
      tr.insert($from.before(blockDepth), blockType.create({ blockId: null, blockType: "text" }, paragraph.create()));
      dispatch(tr.scrollIntoView());
      return true;
    }

    // The tail line: a heading split at its END becomes plain text (you're done
    // with the title); split mid-heading keeps the heading. A paragraph keeps
    // its attrs (e.g. a callout color) on both halves.
    const tail = state.doc.slice(cursor, lineEnd).content;
    const tailLine =
      line.type.name === "heading" && atEnd
        ? paragraph.create(null, tail)
        : line.type.create(line.attrs, tail);
    const newBlock = blockType.create({ blockId: null, blockType: "text" }, tailLine);

    // Move the tail into a new block — a first child when the block has children
    // (so it lands right under the line), else the next sibling.
    tr.delete(cursor, lineEnd);
    const insertPos = tr.mapping.map(hasChildren ? contentNodeEnd : blockEnd);
    tr.insert(insertPos, newBlock);
    tr.setSelection(Selection.near(tr.doc.resolve(insertPos + 2)));
    dispatch(tr.scrollIntoView());
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

/** Move the current block above its previous sibling block. */
export const moveBlockUp: BlockCommand = (state, dispatch) => {
  const { $from } = state.selection;
  const blockDepth = blockDepthAt($from);
  if (blockDepth === null) return false;

  const parentDepth = blockDepth - 1;
  const parent = $from.node(parentDepth);
  const index = $from.index(parentDepth);
  if (index === 0) return false;
  if (parent.child(index - 1).type.name !== BLOCK_NODE_TYPE) return false;

  const blockStart = $from.before(blockDepth);
  const blockEnd = $from.after(blockDepth);
  const blockNode = $from.node(blockDepth);
  const prevStart = $from.posAtIndex(index - 1, parentDepth);

  if (dispatch) {
    const cursorOffset = $from.pos - blockStart;
    const tr = state.tr.delete(blockStart, blockEnd);
    tr.insert(prevStart, blockNode);
    tr.setSelection(Selection.near(tr.doc.resolve(prevStart + cursorOffset)));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Move the current block below its next sibling block. */
export const moveBlockDown: BlockCommand = (state, dispatch) => {
  const { $from } = state.selection;
  const blockDepth = blockDepthAt($from);
  if (blockDepth === null) return false;

  const parentDepth = blockDepth - 1;
  const parent = $from.node(parentDepth);
  const index = $from.index(parentDepth);
  const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
  if (!next || next.type.name !== BLOCK_NODE_TYPE) return false;

  const blockStart = $from.before(blockDepth);
  const blockEnd = $from.after(blockDepth);
  const blockNode = $from.node(blockDepth);
  const nextStart = $from.posAtIndex(index + 1, parentDepth);
  const nextEnd = nextStart + next.nodeSize;

  if (dispatch) {
    const cursorOffset = $from.pos - blockStart;
    const tr = state.tr.delete(blockStart, blockEnd);
    const insertAt = tr.mapping.map(nextEnd);
    tr.insert(insertAt, blockNode);
    tr.setSelection(Selection.near(tr.doc.resolve(insertAt + cursorOffset)));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** The child `block` nodes of a block (everything after its content line). */
function childBlocksOf(block: PMNode): PMNode[] {
  const children: PMNode[] = [];
  block.forEach((child) => {
    if (child.type.name === BLOCK_NODE_TYPE) children.push(child);
  });
  return children;
}

/**
 * Delete an empty block, lifting any children to the block's position so they
 * aren't orphaned, and drop the cursor at the end of the line above.
 */
function deleteEmptyBlock(state: EditorState, dispatch: Dispatch | undefined, blockDepth: number): boolean {
  const { $from } = state.selection;
  const block = $from.node(blockDepth);
  const blockStart = $from.before(blockDepth);
  const blockEnd = $from.after(blockDepth);
  const $target = previousLinePos(state.doc, blockStart);
  if (dispatch) {
    const tr = state.tr.replaceWith(blockStart, blockEnd, childBlocksOf(block));
    if ($target) tr.setSelection(TextSelection.near(tr.doc.resolve($target.pos)));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

/**
 * Merge the current line into the previous block's deepest last line. Any child
 * blocks are lifted into the current block's old position (not orphaned).
 */
function mergeIntoPrevious(state: EditorState, dispatch: Dispatch | undefined, blockDepth: number): boolean {
  const { $from } = state.selection;
  const block = $from.node(blockDepth);
  const blockStart = $from.before(blockDepth);
  const blockEnd = $from.after(blockDepth);
  const lineStart = $from.start();
  const lineEnd = $from.end();

  const $target = previousLinePos(state.doc, blockStart);
  if (!$target || !LINE_TYPES.has($target.parent.type.name)) return false;
  const targetEnd = $target.pos; // sits before blockStart, so edits after it won't move it

  if (dispatch) {
    const tail = state.doc.slice(lineStart, lineEnd).content;
    const tr = state.tr;
    // Replace the whole block with its children (lift them one level); then
    // append this line's text to the previous line. targetEnd < blockStart, so
    // it's unaffected by the replace above.
    tr.replaceWith(blockStart, blockEnd, childBlocksOf(block));
    tr.insert(targetEnd, tail);
    tr.setSelection(TextSelection.create(tr.doc, targetEnd));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

/**
 * Move the caret onto the block above (its last text position, or a selection
 * of an atom like a divider/image). Used when the previous block isn't
 * text-mergeable, so native backspace doesn't fuse two block wrappers.
 */
function moveToPrevious(state: EditorState, dispatch: Dispatch | undefined, blockDepth: number): boolean {
  const { $from } = state.selection;
  const blockStart = $from.before(blockDepth);
  if (dispatch) {
    dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(blockStart), -1)).scrollIntoView());
  }
  return true;
}

/**
 * Backspace at the start of a block's line:
 *  - empty heading → reset to a plain paragraph;
 *  - empty plain paragraph → delete it (outdent if it's a nested first child);
 *  - non-empty first child → outdent;
 *  - non-empty with a previous sibling → merge into the previous block's line.
 * Returns false everywhere else so default backspace (char delete) applies.
 */
export const mergeBlockBackward: BlockCommand = (state, dispatch) => {
  const { selection, schema } = state;
  if (!selection.empty) return false;
  const { $from } = selection;

  const blockDepth = blockDepthAt($from);
  if (blockDepth === null) return false;
  // Task list / blockquote: unwrap a single-line one back to a paragraph.
  if (wrapperBackspace(state, dispatch, $from, blockDepth)) return true;
  if ($from.depth !== blockDepth + 1) return false; // only the block's own line
  const line = $from.parent;
  if (!LINE_TYPES.has(line.type.name)) return false;

  const emptyLine = line.content.size === 0;
  const parentDepth = blockDepth - 1;
  const parent = $from.node(parentDepth);
  const parentIsBlock = parent.type.name === BLOCK_NODE_TYPE;
  const index = $from.index(parentDepth);
  // In `blockContent+ block*` the content node holds index 0, so a block's first
  // CHILD block is the one whose previous sibling isn't itself a block.
  const prevSibling = index > 0 ? parent.child(index - 1) : null;
  const hasPrevBlock = prevSibling?.type.name === BLOCK_NODE_TYPE;
  const isFirstChildBlock = parentIsBlock && !hasPrevBlock;

  // Empty line.
  if (emptyLine) {
    if (line.type.name === "heading") {
      if (dispatch) {
        const pos = $from.before();
        const tr = state.tr.setNodeMarkup(pos, schema.nodes.paragraph, { color: line.attrs.color ?? null });
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    if (isFirstChildBlock) return outdentBlock(state, dispatch);
    if (hasPrevBlock) return deleteEmptyBlock(state, dispatch, blockDepth);
    return false; // first block in the doc
  }

  // Non-empty: only act at the very start of the line.
  if ($from.parentOffset !== 0 || $from.index(blockDepth) !== 0) return false;
  if (isFirstChildBlock) return outdentBlock(state, dispatch);
  if (hasPrevBlock) {
    // Merge into the previous text line; if the block above isn't text
    // (code/table/atom), move onto it rather than fuse the wrappers.
    return mergeIntoPrevious(state, dispatch, blockDepth) || moveToPrevious(state, dispatch, blockDepth);
  }
  return false;
};
