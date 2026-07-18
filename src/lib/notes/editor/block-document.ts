/**
 * Block ⇄ rows bridge for the single-document notes editor.
 *
 * The editor renders ONE ProseMirror document whose top-level children are
 * `block` nodes. Each `block` maps 1:1 onto a row in the `blocks` table:
 *
 *   { type: "block", attrs: { blockId, blockType },
 *     content: [ ...blockContentNodes, ...childBlockNodes ] }
 *
 * - `blockContentNodes` are the block's own "line" content (paragraph, heading,
 *   codeBlock, mathBlock, …) — exactly the nodes stored today inside a block's
 *   `content` document.
 * - `childBlockNodes` are nested `block` nodes (native nesting).
 *
 * `assembleDoc` builds the document from flat rows (load); `decomposeDoc` walks
 * the document back into flat block records (save). Both are pure JSON
 * transforms so they can be unit-tested without a ProseMirror runtime — the
 * persister calls `decomposeDoc(editor.getJSON())`.
 */

import type { JSONContent } from "@tiptap/core";

import { normalizeNoteDocument, serializeNoteDocument } from "@/lib/notes/notes-content";

export const BLOCK_NODE_TYPE = "block";
export const DEFAULT_BLOCK_TYPE = "text";

/** A row as stored in / read from the `blocks` table (editor-relevant columns). */
export interface BlockDocumentRow {
  id: string;
  parent_block_id: string | null;
  sort_rank: string;
  type: string;
  /** Serialized `{ type: "doc", content: [...] }` JSON. */
  content: string;
}

/** A block extracted from the document, in depth-first document order. */
export interface DecomposedBlock {
  blockId: string;
  parentId: string | null;
  type: string;
  /** Serialized, normalized `{ type: "doc", content: [...] }` JSON. */
  content: string;
  /** 0-based index among its siblings (for rank assignment by the differ). */
  order: number;
}

function isBlockNode(node: JSONContent | undefined | null): boolean {
  return Boolean(node && node.type === BLOCK_NODE_TYPE);
}

/** Parse a row's stored content document into its top-level content nodes. */
function contentNodesOf(row: BlockDocumentRow): JSONContent[] {
  const doc = normalizeNoteDocument(row.content) as JSONContent;
  const nodes = Array.isArray(doc.content) ? doc.content : [];
  // Every block must hold at least one content node so the schema stays valid.
  return nodes.length > 0 ? nodes : [{ type: "paragraph" }];
}

/**
 * Build the editor document from flat block rows.
 *
 * Rows may arrive in any order; siblings are ordered by `sort_rank`. Nesting is
 * derived from `parent_block_id`. Rows whose parent is missing are treated as
 * roots (matches `buildNoteBlockTree`).
 */
export function assembleDoc(rows: BlockDocumentRow[]): JSONContent {
  const byId = new Map<string, BlockDocumentRow>(rows.map((row) => [row.id, row]));
  const childrenByParent = new Map<string | null, BlockDocumentRow[]>();

  for (const row of rows) {
    // Orphan (parent not present) → treat as root, mirroring buildNoteBlockTree.
    const parentKey = row.parent_block_id && byId.has(row.parent_block_id) ? row.parent_block_id : null;
    const bucket = childrenByParent.get(parentKey);
    if (bucket) bucket.push(row);
    else childrenByParent.set(parentKey, [row]);
  }

  for (const bucket of childrenByParent.values()) {
    bucket.sort((a, b) => a.sort_rank.localeCompare(b.sort_rank));
  }

  const buildBlockNode = (row: BlockDocumentRow): JSONContent => {
    const childBlocks = (childrenByParent.get(row.id) ?? []).map(buildBlockNode);
    return {
      type: BLOCK_NODE_TYPE,
      attrs: { blockId: row.id, blockType: row.type || DEFAULT_BLOCK_TYPE },
      content: [...contentNodesOf(row), ...childBlocks],
    };
  };

  const rootRows = childrenByParent.get(null) ?? [];
  const blockNodes = rootRows.map(buildBlockNode);

  return {
    type: "doc",
    // A document must contain at least one block.
    content: blockNodes.length > 0 ? blockNodes : [emptyBlockNode()],
  };
}

/** A fresh empty block node (used for empty documents / new blocks). */
export function emptyBlockNode(blockId?: string): JSONContent {
  return {
    type: BLOCK_NODE_TYPE,
    attrs: { blockId: blockId ?? null, blockType: DEFAULT_BLOCK_TYPE },
    content: [{ type: "paragraph" }],
  };
}

/**
 * Walk the editor document back into flat block records in depth-first order.
 *
 * `blockId` may be null for freshly-created nodes that the stable-ID plugin
 * hasn't stamped yet; the persister assigns one before writing. `sort_rank` is
 * intentionally NOT produced here — the differ computes ranks from `order` +
 * the previous row set so unchanged siblings don't churn.
 */
export function decomposeDoc(doc: JSONContent): DecomposedBlock[] {
  const out: DecomposedBlock[] = [];

  const visit = (blockNode: JSONContent, parentId: string | null, order: number) => {
    const attrs = blockNode.attrs ?? {};
    const blockId = typeof attrs.blockId === "string" ? attrs.blockId : "";
    const type = typeof attrs.blockType === "string" && attrs.blockType ? attrs.blockType : DEFAULT_BLOCK_TYPE;

    const children = Array.isArray(blockNode.content) ? blockNode.content : [];
    const contentNodes = children.filter((child) => !isBlockNode(child));
    const childBlocks = children.filter((child) => isBlockNode(child));

    out.push({
      blockId,
      parentId,
      type,
      content: serializeNoteDocument({ type: "doc", content: contentNodes }),
      order,
    });

    childBlocks.forEach((child, index) => visit(child, blockId, index));
  };

  const roots = Array.isArray(doc.content) ? doc.content.filter(isBlockNode) : [];
  roots.forEach((root, index) => visit(root, null, index));

  return out;
}
