/**
 * Binds the native block structural commands to keys.
 *
 * Registered as a ProseMirror keymap plugin. Each command returns false when it
 * doesn't apply (wrong position, can't split/join, in a code block, …), so key
 * presses fall through to the specialized node handlers (code, tables, task
 * lists) and the base keymap. Keep this extension's priority below those
 * specialized handlers so, e.g., Enter in a code block inserts a newline rather
 * than splitting the block.
 */

import { Extension } from "@tiptap/core";
import { keymap } from "@tiptap/pm/keymap";

import { splitBlock, indentBlock, outdentBlock, mergeBlockBackward } from "./block-commands";

export const BlockKeymap = Extension.create({
  name: "notesBlockKeymap",

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
