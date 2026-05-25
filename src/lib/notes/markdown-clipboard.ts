import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";

import type { NoteBlockInsert } from "@/lib/notes/notes";

export type StructuredMarkdownListItem = {
  text: string;
  children: StructuredMarkdownListItem[];
};

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  checked?: boolean | null;
};

function normalizeMarkdownText(markdown: string) {
  return markdown
    .replace(/\\\[\\\[/g, "[[")
    .replace(/\\\]\\\]/g, "]]")
    .replace(/(^|[\s(])\\#([a-z0-9][a-z0-9_/-]*)/gi, "$1#$2");
}

function isListNode(node: MarkdownNode | undefined): node is MarkdownNode & { children: MarkdownNode[] } {
  return node?.type === "list" && Array.isArray(node.children);
}

function isListItemNode(node: MarkdownNode | undefined): node is MarkdownNode & { children: MarkdownNode[] } {
  return node?.type === "listItem" && Array.isArray(node.children);
}

function isThematicBreakNode(node: MarkdownNode | undefined) {
  return node?.type === "thematicBreak";
}

function renderMarkdownNodes(nodes: MarkdownNode[]) {
  if (nodes.length === 0) {
    return "";
  }

  if (nodes.length === 1 && isThematicBreakNode(nodes[0])) {
    return "---";
  }

  return normalizeMarkdownText(
    toMarkdown(
      {
        type: "root",
        children: nodes,
      } as never,
      {
        extensions: [gfmToMarkdown()],
      }
    ).trim()
  );
}

function normalizeThematicBreaksInLists(text: string): string {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Only process bare `---` / `***` / `___` at root level (no indentation)
    if (!/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      result.push(line);
      continue;
    }

    // Find the nearest non-empty line above
    let aboveIndent: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (lines[j].trim().length > 0) {
        const match = lines[j].match(/^(\t+| {2,})/);
        if (match) aboveIndent = match[1];
        break;
      }
    }

    // Find the nearest non-empty line below
    let belowIndent: string | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim().length > 0) {
        const match = lines[j].match(/^(\t+| {2,})/);
        if (match) belowIndent = match[1];
        break;
      }
    }

    // If both neighbors are indented, wrap the --- as a list item at that indent
    if (aboveIndent && belowIndent) {
      result.push(`${aboveIndent}- ---`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

function parseMarkdownListAst(text: string): StructuredMarkdownListItem[] | null {
  const normalizedText = normalizeThematicBreaksInLists(text);
  const root = fromMarkdown(normalizedText, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as MarkdownNode & { children?: MarkdownNode[] };

  const nodes = Array.isArray(root.children) ? root.children : [];
  if (nodes.length === 0) {
    return null;
  }

  if (!nodes.every((node) => isListNode(node) || isThematicBreakNode(node))) {
    return null;
  }

  const toStructuredItem = (node: MarkdownNode): StructuredMarkdownListItem[] => {
    if (isThematicBreakNode(node)) {
      return [{ text: "---", children: [] }];
    }

    if (!isListNode(node)) {
      return [];
    }

    return node.children.filter(isListItemNode).map((item) => {
      // Process children in order: content nodes before the first list are the item's text.
      // Lists become nested children. Thematic breaks after the first list become separator children.
      const contentNodes: MarkdownNode[] = [];
      const nestedChildren: StructuredMarkdownListItem[] = [];
      let seenList = false;

      for (const child of item.children) {
        if (isListNode(child)) {
          seenList = true;
          nestedChildren.push(...toStructuredItem(child));
        } else if (seenList && isThematicBreakNode(child)) {
          nestedChildren.push({ text: "---", children: [] });
        } else if (!seenList) {
          contentNodes.push(child);
        }
      }

      const serializedText = renderMarkdownNodes(contentNodes);
      const text = typeof item.checked === "boolean"
        ? `[${item.checked ? "x" : " "}] ${serializedText}`.trimEnd()
        : serializedText;

      return {
        text,
        children: nestedChildren,
      };
    });
  };

  const roots: StructuredMarkdownListItem[] = [];

  for (const node of nodes) {
    if (isThematicBreakNode(node)) {
      const lastRoot = roots[roots.length - 1];
      if (lastRoot && lastRoot.text.length === 0 && lastRoot.children.length === 0) {
        roots.pop();
      }
    }

    roots.push(...toStructuredItem(node));
  }

  return roots;
}

export function parseStructuredMarkdownList(text: string): StructuredMarkdownListItem[] | null {
  return parseMarkdownListAst(text);
}

export function markdownListItemsToBlocks(
  items: StructuredMarkdownListItem[],
  parseContent: (text: string) => NoteBlockInsert["content"]
): NoteBlockInsert[] {
  return items.map(function toBlock(item): NoteBlockInsert {
    return {
      content: parseContent(item.text),
      children: markdownListItemsToBlocks(item.children, parseContent),
    };
  });
}

export function parseMarkdownListBlocks(
  text: string,
  parseContent: (text: string) => NoteBlockInsert["content"]
): NoteBlockInsert[] | null {
  const items = parseStructuredMarkdownList(text);
  return items ? markdownListItemsToBlocks(items, parseContent) : null;
}