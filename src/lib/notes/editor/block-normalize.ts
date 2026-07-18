/**
 * Block invariant enforcer: every `block` holds exactly ONE content node (its
 * "line") followed by nested child blocks — `blockContent block*`.
 *
 * The schema stays permissive (`blockContent+ block*`) so loading never drops
 * data, but a stray second content node ("frankenblock") can appear when native
 * ProseMirror commands lift a node up into the block wrapper — e.g. exiting an
 * empty task item or blockquote with Enter leaves a trailing paragraph beside
 * the list/quote. This plugin runs after such edits and splits every extra
 * content node into its own sibling block, so the one-line-per-block model holds
 * without hand-guarding every command.
 *
 * Multiline text within a single block is expressed with inline hard breaks
 * (Shift+Enter), never multiple content nodes — so this never fights soft
 * breaks.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

import { BLOCK_NODE_TYPE, DEFAULT_BLOCK_TYPE } from "./block-document";

const normalizeKey = new PluginKey("notesBlockNormalize");

function contentAndChildBlocks(block: PMNode): { content: PMNode[]; children: PMNode[] } {
  const content: PMNode[] = [];
  const children: PMNode[] = [];
  block.forEach((child) => {
    if (child.type.name === BLOCK_NODE_TYPE) children.push(child);
    else content.push(child);
  });
  return { content, children };
}

export const BlockNormalize = Extension.create({
  name: "notesBlockNormalize",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: normalizeKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          // Ignore our own repair pass so we can never loop.
          if (transactions.some((tr) => tr.getMeta(normalizeKey))) return null;

          const blockType = newState.schema.nodes[BLOCK_NODE_TYPE];
          const franken: number[] = [];
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== BLOCK_NODE_TYPE) return true;
            if (contentAndChildBlocks(node).content.length > 1) franken.push(pos);
            return true;
          });
          if (franken.length === 0) return null;

          const { from } = newState.selection;
          const tr = newState.tr;
          let cursorTo: number | null = null;

          // Positions map forward as we go; each is re-derived from the live doc.
          for (const originalPos of franken) {
            const pos = tr.mapping.map(originalPos);
            const node = tr.doc.nodeAt(pos);
            if (!node || node.type.name !== BLOCK_NODE_TYPE) continue;
            const { content, children } = contentAndChildBlocks(node);
            if (content.length <= 1) continue;

            // Keep the first content node (+ children) in the original block; each
            // extra content node becomes its own fresh sibling block after it.
            const first = blockType.create(node.attrs, [content[0], ...children]);
            const extras = content.slice(1).map((c) => blockType.create({ blockId: null, blockType: DEFAULT_BLOCK_TYPE }, c));
            const selectionInside = from > pos && from < pos + node.nodeSize;
            tr.replaceWith(pos, pos + node.nodeSize, [first, ...extras]);

            // Drop the caret into the first split-off block (the lifted line the
            // user just created by exiting a list/quote).
            if (selectionInside && extras.length > 0) {
              cursorTo = pos + first.nodeSize + 2; // into extras[0]'s content
            }
          }

          tr.setMeta(normalizeKey, true);
          tr.setMeta("addToHistory", false);
          if (cursorTo != null) {
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(cursorTo, tr.doc.content.size))));
          }
          return tr;
        },
      }),
    ];
  },
});
