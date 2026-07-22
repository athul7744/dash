"use client";

/**
 * A single-field rich text input that supports inline `[[ ]]` reference chips.
 * Drop-in replacement for a card's textarea/input: it takes the field's plain
 * string (which may contain `[[label|kind:id]]` tokens), renders text + chip
 * nodes, and emits the string back on every edit. Preserves the field contract
 * — placeholder, blur/commit, maxLength, readOnly — so the card keeps its own
 * (debounced) column persistence.
 */

import { useEffect, useRef } from "react";
import { Extension, type JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";

import { EntityRefNode } from "@/components/links/EntityRefNode";
import { RefMenuLayer } from "@/components/notes/editor/RefMenuLayer";
import { formatRefToken, parseRefSegments, ENTITY_REF_NODE_TYPE } from "@/lib/links/tokens";
import { cn } from "@/lib/shared/utils";

/** Build a doc from the stored string (id tokens → chip nodes, rest → text). */
function valueToContent(value: string): JSONContent {
  const lines = (value || "").split("\n");
  const paragraphs: JSONContent[] = lines.map((line) => {
    const content: JSONContent[] = parseRefSegments(line).flatMap((seg): JSONContent[] =>
      seg.type === "text"
        ? seg.text
          ? [{ type: "text", text: seg.text }]
          : []
        : [{ type: ENTITY_REF_NODE_TYPE, attrs: { kind: seg.kind, id: seg.id, label: seg.label } }],
    );
    return content.length ? { type: "paragraph", content } : { type: "paragraph" };
  });
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}

/** Serialize the editor doc back to the stored string form. */
function docToValue(json: JSONContent): string {
  const nodeText = (node: JSONContent): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === ENTITY_REF_NODE_TYPE) {
      return formatRefToken({ label: node.attrs?.label ?? "", kind: node.attrs?.kind, id: node.attrs?.id });
    }
    return Array.isArray(node.content) ? node.content.map(nodeText).join("") : "";
  };
  const blocks = Array.isArray(json.content) ? json.content : [];
  return blocks.map(nodeText).join("\n");
}

/** Minimal empty-state placeholder (the Placeholder extension isn't installed). */
function placeholderExtension(text: string) {
  return Extension.create({
    name: "refFieldPlaceholder",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations: ({ doc }) => {
              const first = doc.firstChild;
              const isEmpty = doc.childCount === 1 && !!first?.isTextblock && first.content.size === 0;
              if (!isEmpty || !text) return null;
              return DecorationSet.create(doc, [
                Decoration.node(0, first!.nodeSize, { class: "is-empty", "data-placeholder": text }),
              ]);
            },
          },
        }),
      ];
    },
  });
}

export function RefField({
  value,
  onChange,
  onCommit,
  onBlur,
  onFocus,
  placeholder,
  singleLine = false,
  clearOnCommit = false,
  readOnly = false,
  maxLength,
  excludeId,
  className,
  ariaLabel,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter when singleLine (commit/save). */
  onCommit?: () => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  singleLine?: boolean;
  /** On Enter (singleLine), clear the field and keep focus instead of blurring —
      for composers that add many items in a row. */
  clearOnCommit?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  /** Entity id to omit from the `[[` picker (the field's own entity). */
  excludeId?: string | null;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const lastValueRef = useRef(value);

  // useEditor freezes its options at first render, so route every callback and
  // dynamic flag through a ref that we keep current each render.
  const cb = useRef({ onChange, onCommit, onBlur, onFocus, singleLine, clearOnCommit, maxLength });
  useEffect(() => {
    cb.current = { onChange, onCommit, onBlur, onFocus, singleLine, clearOnCommit, maxLength };
  });

  const editor = useEditor(
    {
      editable: !readOnly,
      immediatelyRender: false,
      autofocus: autoFocus ? "end" : false,
      extensions: [
        Document,
        Paragraph,
        Text,
        EntityRefNode,
        ...(placeholder ? [placeholderExtension(placeholder)] : []),
      ],
      content: valueToContent(value),
      editorProps: {
        attributes: {
          class: "ref-field-input outline-none whitespace-pre-wrap break-words",
          ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        },
        handleKeyDown: (view, event) => {
          if (cb.current.singleLine && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            cb.current.onCommit?.();
            if (cb.current.clearOnCommit) {
              // Clear in place and keep focus so the next item can be typed.
              view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
              lastValueRef.current = "";
            } else {
              (view.dom as HTMLElement).blur();
            }
            return true;
          }
          return false;
        },
        handleTextInput: (view, from, to, text) => {
          const max = cb.current.maxLength;
          if (!max) return false;
          const nextLen = view.state.doc.textContent.length - (to - from) + text.length;
          return nextLen > max;
        },
      },
      onUpdate: ({ editor }) => {
        const next = docToValue(editor.getJSON());
        if (next !== lastValueRef.current) {
          lastValueRef.current = next;
          cb.current.onChange(next);
        }
      },
      onBlur: () => cb.current.onBlur?.(),
      onFocus: () => cb.current.onFocus?.(),
    },
    [],
  );

  // Resync when the value changes externally (not from our own edits, and not
  // while focused — local typing wins until blur).
  useEffect(() => {
    if (!editor) return;
    if (value === lastValueRef.current || editor.isFocused) return;
    lastValueRef.current = value;
    editor.commands.setContent(valueToContent(value));
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div className={cn("ref-field", className)}>
      <EditorContent editor={editor} />
      {readOnly ? null : <RefMenuLayer editor={editor} excludeId={excludeId} />}
    </div>
  );
}
