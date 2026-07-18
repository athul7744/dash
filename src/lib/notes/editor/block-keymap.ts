/**
 * Binds the native block structural commands to keys.
 *
 * Registered as a ProseMirror keymap plugin at HIGH priority so it runs before
 * the task-list / blockquote / base keymaps — block-level exits (empty task or
 * quote → paragraph, backspace-merge across blocks) must win over the native
 * list/quote lift commands, which misbehave inside the `block` wrapper. Each
 * command still returns false when it doesn't apply (non-empty item, code
 * block, table cell, …), so those keys fall through to the specialized handlers
 * and the base keymap as before.
 */

import { Extension } from "@tiptap/core";
import { keymap } from "@tiptap/pm/keymap";

import { splitBlock, indentBlock, outdentBlock, mergeBlockBackward } from "./block-commands";

export const BlockKeymap = Extension.create({
  name: "notesBlockKeymap",
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      keymap({
        Enter: splitBlock,
        Tab: indentBlock,
        "Shift-Tab": outdentBlock,
        Backspace: mergeBlockBackward,
      }),
    ];
  },
});
