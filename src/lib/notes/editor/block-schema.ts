/**
 * Tiptap schema for the single-document notes editor.
 *
 * - `NotesDocument` overrides the default document to contain `block` nodes only.
 * - `BlockNode` is the wrapper node that maps 1:1 to a `blocks` row: it holds the
 *   block's own content node(s) followed by nested child `block` nodes.
 * - `asBlockContent` re-groups an existing content node (paragraph, heading,
 *   codeBlock, …) into the `blockContent` group so it can only live inside a
 *   `block`, never directly under the document.
 *
 * The block NodeView (drag handle, context menu, markdown toggle) is layered on
 * in the editor component; this module is the pure schema.
 */

import Document from "@tiptap/extension-document";
import { Node, mergeAttributes, type Extension, type Node as TiptapNode } from "@tiptap/core";

import { BLOCK_NODE_TYPE, DEFAULT_BLOCK_TYPE } from "./block-document";

export const BLOCK_CONTENT_GROUP = "blockContent";

/** Document root: a sequence of blocks. */
export const NotesDocument = Document.extend({
  content: `${BLOCK_NODE_TYPE}+`,
});

/**
 * The block wrapper. Content = one or more content nodes, then any nested
 * child blocks: `blockContent+ block*`. `blockId` is the stable `blocks.id`;
 * `blockType` is the row `type` (`"text"` | `"query"`).
 */
export const BlockNode = Node.create({
  name: BLOCK_NODE_TYPE,
  group: "block",
  content: `${BLOCK_CONTENT_GROUP}+ ${BLOCK_NODE_TYPE}*`,
  defining: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attributes) =>
          attributes.blockId ? { "data-block-id": attributes.blockId as string } : {},
      },
      blockType: {
        default: DEFAULT_BLOCK_TYPE,
        parseHTML: (element) => element.getAttribute("data-block-type") ?? DEFAULT_BLOCK_TYPE,
        renderHTML: (attributes) => ({ "data-block-type": (attributes.blockType as string) || DEFAULT_BLOCK_TYPE }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-block-id], div[data-block-type]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "note-block" }), 0];
  },
});

/**
 * Re-group a content-node extension so it belongs to `blockContent` (only valid
 * inside a `block`) instead of the default `block` group. Apply to every leaf
 * content node when assembling the editor's extension list.
 */
export function asBlockContent<T extends TiptapNode | Extension>(extension: T): T {
  return (extension as TiptapNode).extend({ group: BLOCK_CONTENT_GROUP }) as unknown as T;
}
