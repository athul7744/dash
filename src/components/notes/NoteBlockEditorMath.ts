import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import katex from "katex";
import { escapeHtml } from "@/lib/shared/utils";

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
    return [{
      tag: 'span[data-math-inline]',
      getAttrs: (node) => {
        const el = node as HTMLElement;
        return { latex: el.getAttribute('data-latex') ?? '' };
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const latex = (HTMLAttributes.latex as string) || "";
    const { latex: _latex, ...rest } = HTMLAttributes;
    return [
      "span",
      mergeAttributes(rest, {
        "data-math-inline": "",
        "data-latex": latex,
        class: "math-inline-node",
        contenteditable: "false",
      }),
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
      dom.setAttribute("data-latex", currentLatex);

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
          dom.setAttribute("data-latex", nextLatex);
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
    return [{
      tag: 'div[data-math-block]',
      getAttrs: (node) => {
        const el = node as HTMLElement;
        return { latex: el.getAttribute('data-latex') ?? '' };
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const latex = (HTMLAttributes.latex as string) || "";
    const { latex: _latex, ...rest } = HTMLAttributes;
    return [
      "div",
      mergeAttributes(rest, {
        "data-math-block": "",
        "data-latex": latex,
        class: "math-block-node",
        contenteditable: "false",
      }),
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
      dom.setAttribute("data-latex", currentLatex);

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
          dom.setAttribute("data-latex", nextLatex);
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
