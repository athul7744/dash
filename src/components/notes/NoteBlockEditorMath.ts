import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import katex from "katex";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: "htmlAndMathml",
      trust: false,
      strict: false,
      maxSize: 50,
      maxExpand: 100,
    });
  } catch {
    return `<code class="katex-error">${escapeHtml(latex)}</code>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Inline math  $...$
// ---------------------------------------------------------------------------

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const latex = (HTMLAttributes.latex as string) || "";
    const rendered = renderKatex(latex, false);
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-math-inline": "",
        class: "math-inline-node",
        contenteditable: "false",
      }),
      ["span", { class: "math-rendered", innerHTML: rendered }],
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("span");
      dom.classList.add("math-inline-node");
      dom.setAttribute("data-math-inline", "");
      dom.contentEditable = "false";

      let isEditing = false;
      let currentLatex = (node.attrs.latex as string) || "";

      const renderedSpan = document.createElement("span");
      renderedSpan.classList.add("math-rendered");

      const inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.classList.add("math-inline-input");
      inputEl.style.display = "none";

      dom.appendChild(renderedSpan);
      dom.appendChild(inputEl);

      function renderPreview() {
        renderedSpan.innerHTML = renderKatex(currentLatex, false);
        renderedSpan.style.display = "";
        inputEl.style.display = "none";
        isEditing = false;
      }

      function startEditing() {
        if (isEditing) return;
        isEditing = true;
        inputEl.value = currentLatex;
        renderedSpan.style.display = "none";
        inputEl.style.display = "";
        inputEl.focus();
        inputEl.select();
      }

      function commitEdit() {
        const nextLatex = inputEl.value.trim();
        if (nextLatex !== currentLatex) {
          currentLatex = nextLatex;
          const pos = getPos();
          if (typeof pos === "number") {
            editor.chain().focus().command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, { latex: nextLatex });
              return true;
            }).run();
          }
        }
        renderPreview();
      }

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEditing();
      });

      inputEl.addEventListener("blur", () => {
        commitEdit();
      });

      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEdit();
          editor.commands.focus();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          inputEl.value = currentLatex;
          renderPreview();
          editor.commands.focus();
        }
        // Prevent Tiptap from handling these keys while editing math
        e.stopPropagation();
      });

      renderPreview();

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== "mathInline") return false;
          currentLatex = (updatedNode.attrs.latex as string) || "";
          if (!isEditing) renderPreview();
          return true;
        },
        stopEvent(event) {
          // Let the input handle its own events
          return dom.contains(event.target as HTMLElement);
        },
        destroy() {
          // cleanup
        },
      };
    };
  },

  addInputRules() {
    return [
      new InputRule({
        // Match $...$ but not $$
        find: /(?<!\$)\$([^\$\s][^\$]*?)\$$/,
        handler: ({ chain, range, match }) => {
          const latex = match[1];
          if (!latex) return;
          chain()
            .deleteRange(range)
            .insertContent({ type: "mathInline", attrs: { latex } })
            .run();
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Display/block math  $$...$$
// ---------------------------------------------------------------------------

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-math-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const latex = (HTMLAttributes.latex as string) || "";
    const rendered = renderKatex(latex, true);
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-math-block": "",
        class: "math-block-node",
        contenteditable: "false",
      }),
      ["div", { class: "math-rendered", innerHTML: rendered }],
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div");
      dom.classList.add("math-block-node");
      dom.setAttribute("data-math-block", "");
      dom.contentEditable = "false";

      let isEditing = false;
      let currentLatex = (node.attrs.latex as string) || "";

      const renderedDiv = document.createElement("div");
      renderedDiv.classList.add("math-rendered");

      const textareaEl = document.createElement("textarea");
      textareaEl.classList.add("math-block-input");
      textareaEl.style.display = "none";
      textareaEl.rows = 3;

      dom.appendChild(renderedDiv);
      dom.appendChild(textareaEl);

      function renderPreview() {
        renderedDiv.innerHTML = renderKatex(currentLatex, true);
        renderedDiv.style.display = "";
        textareaEl.style.display = "none";
        isEditing = false;
      }

      function startEditing() {
        if (isEditing) return;
        isEditing = true;
        textareaEl.value = currentLatex;
        renderedDiv.style.display = "none";
        textareaEl.style.display = "";
        textareaEl.focus();
        textareaEl.select();
      }

      function commitEdit() {
        const nextLatex = textareaEl.value.trim();
        if (nextLatex !== currentLatex) {
          currentLatex = nextLatex;
          const pos = getPos();
          if (typeof pos === "number") {
            editor.chain().focus().command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, { latex: nextLatex });
              return true;
            }).run();
          }
        }
        renderPreview();
      }

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEditing();
      });

      textareaEl.addEventListener("blur", () => {
        commitEdit();
      });

      textareaEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commitEdit();
          editor.commands.focus();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          textareaEl.value = currentLatex;
          renderPreview();
          editor.commands.focus();
        }
        e.stopPropagation();
      });

      renderPreview();

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== "mathBlock") return false;
          currentLatex = (updatedNode.attrs.latex as string) || "";
          if (!isEditing) renderPreview();
          return true;
        },
        stopEvent(event) {
          return dom.contains(event.target as HTMLElement);
        },
        destroy() {
          // cleanup
        },
      };
    };
  },

  addInputRules() {
    return [
      new InputRule({
        // Match $$...$$ at the start of a paragraph (typed as full line)
        find: /^\$\$([^\$]+)\$\$$/,
        handler: ({ chain, range, match }) => {
          const latex = match[1];
          if (!latex) return;
          chain()
            .deleteRange(range)
            .insertContent({ type: "mathBlock", attrs: { latex } })
            .run();
        },
      }),
    ];
  },
});
