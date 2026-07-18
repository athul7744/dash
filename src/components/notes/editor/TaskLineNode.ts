/**
 * `taskLine` — a single checkbox line, the content node of a task block.
 *
 * In the single-document model each checklist item is its OWN block (blockType
 * "task") whose content node is one `taskLine`, rather than many `taskItem`s
 * inside one `taskList` in one block. That keeps the "one block = one line"
 * invariant and lets Enter/Backspace/indent/drag be the same uniform block
 * commands as every other line. Consecutive task blocks read as a checklist.
 *
 * A plain-DOM NodeView draws the checkbox (toggling the `checked` attr) plus the
 * inline text hole — cheap at scale, matching the block NodeView approach.
 */

import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { NodeViewRendererProps } from "@tiptap/core";

import { BLOCK_CONTENT_GROUP } from "@/lib/notes/editor/block-schema";

export const TASK_LINE_NODE = "taskLine";

export const TaskLine = TiptapNode.create({
  name: TASK_LINE_NODE,
  group: BLOCK_CONTENT_GROUP,
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-checked") === "true",
        renderHTML: (attributes) => ({ "data-checked": attributes.checked ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-task-line]" }, { tag: "li[data-checked]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-task-line": "true", class: "note-task-line" }),
      ["span", { class: "note-task-checkbox", contenteditable: "false" }],
      ["div", { class: "note-task-text" }, 0],
    ];
  },

  addNodeView() {
    return (props) => createTaskLineView(props);
  },
});

function createTaskLineView(props: NodeViewRendererProps) {
  const { editor, getPos } = props;
  let node = props.node;

  const dom = document.createElement("div");
  dom.className = "note-task-line";

  const checkbox = document.createElement("button");
  checkbox.type = "button";
  checkbox.className = "note-task-checkbox";
  checkbox.setAttribute("contenteditable", "false");
  checkbox.setAttribute("role", "checkbox");
  checkbox.setAttribute("aria-label", "Toggle task");

  const contentDOM = document.createElement("div");
  contentDOM.className = "note-task-text";

  const apply = (updated: PMNode) => {
    const checked = updated.attrs.checked === true;
    dom.classList.toggle("is-checked", checked);
    checkbox.setAttribute("aria-checked", checked ? "true" : "false");
  };

  checkbox.addEventListener("mousedown", (event) => event.preventDefault());
  checkbox.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editor.isEditable) return;
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos == null) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }));
  });

  dom.append(checkbox, contentDOM);
  apply(node);

  return {
    dom,
    contentDOM,
    update(updated: PMNode) {
      if (updated.type.name !== node.type.name) return false;
      node = updated;
      apply(updated);
      return true;
    },
    ignoreMutation(mutation: MutationRecord | { type: string; target: Node }) {
      return checkbox.contains(mutation.target as Node);
    },
  };
}
