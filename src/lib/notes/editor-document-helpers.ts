import type { Editor } from "@tiptap/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PageReferenceQuery = {
  query: string;
  from: number;
  to: number;
};

export type ResolvedPageReference = {
  title: string;
  from: number;
  to: number;
};

// ---------------------------------------------------------------------------
// Page reference query
// ---------------------------------------------------------------------------

export function getPageReferenceQuery(editor: Editor): PageReferenceQuery | null {
  const { state } = editor;

  if (!state.selection.empty) {
    return null;
  }

  const { $from, from } = state.selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "", "\0");
  const triggerIndex = textBefore.lastIndexOf("[[");
  if (triggerIndex < 0) {
    return null;
  }

  const lastClosedIndex = textBefore.lastIndexOf("]]"
  );
  if (lastClosedIndex > triggerIndex) {
    return null;
  }

  const textAfter = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, "", "\0");
  const closingIndex = textAfter.indexOf("]]"
  );
  const suffix = closingIndex >= 0 ? textAfter.slice(0, closingIndex) : "";
  const prefix = textBefore.slice(triggerIndex + 2);
  const query = `${textBefore.slice(triggerIndex + 2)}${suffix}`;

  if (closingIndex === 0 && prefix.trim().length === 0) {
    return null;
  }

  if (query.includes("[[") || query.includes("]]")) {
    return null;
  }

  return {
    query,
    from: $from.start() + triggerIndex,
    to: closingIndex >= 0 ? from + closingIndex + 2 : from,
  };
}

export function getResolvedPageReferenceAtPosition(editor: Editor, position: number): ResolvedPageReference | null {
  const boundedPosition = Math.max(0, Math.min(position, editor.state.doc.content.size));
  const resolvedPosition = editor.state.doc.resolve(boundedPosition);
  const parentText = resolvedPosition.parent.textBetween(0, resolvedPosition.parent.content.size, "", "\0");
  const parentOffset = resolvedPosition.parentOffset;

  for (const match of parentText.matchAll(/\[\[([^\]]+)\]\]/g)) {
    if (match.index === undefined) {
      continue;
    }

    const from = match.index;
    const to = from + match[0].length;
    if (parentOffset < from || parentOffset > to) {
      continue;
    }

    const title = (match[1] ?? "").trim();
    if (!title) {
      return null;
    }

    return {
      title,
      from,
      to,
    };
  }

  return null;
}
