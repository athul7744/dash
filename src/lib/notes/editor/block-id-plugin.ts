/**
 * Stable block-id plugin.
 *
 * Every `block` node must carry a unique `blockId` — it IS the `blocks.id` used
 * by edges, attachments, backlinks, and the doc⇄rows differ. New blocks (split,
 * "add block") arrive with `blockId: null`; copy/paste and node duplication can
 * clone an existing id. This plugin stamps a fresh id on any block that lacks
 * one or repeats an id already seen earlier in the document.
 *
 * The dedup decision is factored into `resolveBlockId` so it can be unit-tested
 * without a ProseMirror runtime.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { v4 as uuidv4 } from "uuid";

import { BLOCK_NODE_TYPE } from "./block-document";

/**
 * Decide the id a block should keep. Returns the current id when it is present
 * and unseen; otherwise returns a freshly minted id. Callers pass a `seen` set
 * that they mutate as they walk the document in order.
 */
export function resolveBlockId(
  current: string | null | undefined,
  seen: Set<string>,
  mint: () => string = uuidv4,
): string {
  if (current && !seen.has(current)) {
    seen.add(current);
    return current;
  }
  let next = mint();
  while (seen.has(next)) next = mint();
  seen.add(next);
  return next;
}

const blockIdPluginKey = new PluginKey("notesBlockId");

export const BlockIdPlugin = Extension.create({
  name: "notesBlockId",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockIdPluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const seen = new Set<string>();
          const fixes: { pos: number; id: string }[] = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== BLOCK_NODE_TYPE) return;
            const current = node.attrs.blockId as string | null;
            const resolved = resolveBlockId(current, seen);
            if (resolved !== current) fixes.push({ pos, id: resolved });
          });

          if (fixes.length === 0) return null;

          const tr = newState.tr;
          for (const { pos, id } of fixes) {
            tr.setNodeAttribute(pos, "blockId", id);
          }
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
    ];
  },
});
