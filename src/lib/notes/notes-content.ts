import { formatRefTokenFromAttrs, ENTITY_REF_NODE_TYPE } from "@/lib/links/tokens";
import { DATE_TOKEN_NODE_TYPE, dateLabelToToken } from "@/lib/notes/date-tokens";

/** The `{MMM d, yyyy}` token a dateToken node stands for (text extraction/markdown). */
function dateTokenToText(attrs: Record<string, unknown> | null): string {
  const date = typeof attrs?.date === "string" ? attrs.date : "";
  return date ? dateLabelToToken(date) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNoteDocument(value: unknown): value is Record<string, unknown> & { type: string } {
  return isRecord(value) && typeof value.type === "string";
}

function normalizeObjectEntries(record: Record<string, unknown>) {
  const normalizedEntries = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, normalizeUnknownValue(value)] as const)
    .filter(([, value]) => value !== undefined);

  normalizedEntries.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return Object.fromEntries(normalizedEntries);
}

function normalizeUnknownValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeUnknownValue(item))
      .filter((item) => item !== undefined);
  }

  if (isRecord(value)) {
    return normalizeObjectEntries(value);
  }

  return value;
}

function normalizeNoteMark(mark: unknown) {
  if (!isRecord(mark) || typeof mark.type !== "string") {
    return null;
  }

  const normalizedMark: Record<string, unknown> = {
    type: mark.type,
  };

  if (isRecord(mark.attrs)) {
    const attrs = normalizeObjectEntries(mark.attrs);
    const filteredAttrs = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== null));
    if (Object.keys(filteredAttrs).length > 0) {
      normalizedMark.attrs = filteredAttrs;
    }
  }

  return normalizedMark;
}

function normalizeNoteNode(node: unknown): Record<string, unknown> | null {
  if (!isRecord(node) || typeof node.type !== "string") {
    return null;
  }

  const normalizedNode: Record<string, unknown> = {
    type: node.type,
  };

  if (isRecord(node.attrs)) {
    const attrs = normalizeObjectEntries(node.attrs);
    // Strip null-valued attrs (Tiptap includes defaults like color:null, but they're semantically "not set")
    const filteredAttrs = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== null));
    if (Object.keys(filteredAttrs).length > 0) {
      normalizedNode.attrs = filteredAttrs;
    }
  }

  if (typeof node.text === "string") {
    normalizedNode.text = node.text;
  }

  if (Array.isArray(node.marks)) {
    const marks = node.marks
      .map((mark) => normalizeNoteMark(mark))
      .filter((mark): mark is Record<string, unknown> => mark !== null);

    if (marks.length > 0) {
      normalizedNode.marks = marks;
    }
  }

  if (Array.isArray(node.content)) {
    const content = node.content
      .map((child) => normalizeNoteNode(child))
      .filter((child): child is Record<string, unknown> => child !== null);

    if (content.length > 0) {
      normalizedNode.content = content;
    }
  }

  return normalizedNode;
}

export function createEmptyNoteDocument() {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

export function createNoteDocumentFromText(text: string) {
  const trimmedText = text.trim();

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: trimmedText.length > 0 ? [{ type: "text", text }] : [],
      },
    ],
  };
}

export function parseSerializedRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  if (isRecord(raw)) {
    return raw;
  }

  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (isRecord(parsed)) {
      return parsed;
    }

    if (typeof parsed === "string") {
      try {
        const reparsed = JSON.parse(parsed) as unknown;
        return isRecord(reparsed) ? reparsed : null;
      } catch {
        return null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseSerializedDocument(raw: string): Record<string, unknown> | null {
  const parsedRecord = parseSerializedRecord(raw);

  return isNoteDocument(parsedRecord) ? parsedRecord : null;
}

export function normalizeNoteDocument(raw: unknown): Record<string, unknown> {
  const normalizeResolvedDocument = (value: unknown) => normalizeNoteNode(value) ?? createEmptyNoteDocument();

  if (!raw) {
    return createEmptyNoteDocument();
  }

  if (isNoteDocument(raw)) {
    return normalizeResolvedDocument(raw);
  }

  if (typeof raw !== "string") {
    return createEmptyNoteDocument();
  }

  const parsedDocument = parseSerializedDocument(raw);
  if (parsedDocument) {
    return normalizeResolvedDocument(parsedDocument);
  }

  if (raw.trim().length === 0) {
    return createEmptyNoteDocument();
  }

  return normalizeResolvedDocument(createNoteDocumentFromText(raw));
}

export function serializeNoteDocument(raw: unknown) {
  return JSON.stringify(normalizeNoteDocument(raw));
}

export function extractNoteText(raw: unknown) {
  const parts: string[] = [];

  const visit = (value: unknown) => {
    if (!isRecord(value)) {
      return;
    }

    if (typeof value.text === "string") {
      parts.push(value.text);
    }

    // An entityRef atom has no `.text`; surface its token so edge reconcile sees it.
    if (value.type === ENTITY_REF_NODE_TYPE) {
      parts.push(formatRefTokenFromAttrs(getNodeAttrs(value)));
    }

    // A dateToken atom has no `.text`; surface its `{…}` token form.
    if (value.type === DATE_TOKEN_NODE_TYPE) {
      parts.push(dateTokenToText(getNodeAttrs(value)));
    }

    if (Array.isArray(value.content)) {
      for (const child of value.content) {
        visit(child);
      }
    }
  };

  visit(normalizeNoteDocument(raw));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function getNodeAttrs(node: unknown) {
  return isRecord(node) && isRecord(node.attrs) ? node.attrs : null;
}

function getNodeContent(node: unknown) {
  return isRecord(node) && Array.isArray(node.content) ? node.content : [];
}

function getNodeMarks(node: unknown) {
  return isRecord(node) && Array.isArray(node.marks) ? node.marks : [];
}

function getNodeText(node: unknown) {
  return isRecord(node) && typeof node.text === "string" ? node.text : "";
}

function serializeMarkdownInline(node: unknown): string {
  if (!isRecord(node) || typeof node.type !== "string") {
    return "";
  }

  if (node.type === "text") {
    let text = getNodeText(node);

    for (const mark of getNodeMarks(node)) {
      if (!isRecord(mark) || typeof mark.type !== "string") {
        continue;
      }

      if (mark.type === "code") {
        text = `\`${text}\``;
        continue;
      }

      if (mark.type === "bold") {
        text = `**${text}**`;
        continue;
      }

      if (mark.type === "italic") {
        text = `*${text}*`;
        continue;
      }

      if (mark.type === "strike") {
        text = `~~${text}~~`;
        continue;
      }

      if (mark.type === "link") {
        const href = getNodeAttrs(mark)?.href;
        if (typeof href === "string" && href.length > 0) {
          text = `[${text}](${href})`;
        }
      }
    }

    return text;
  }

  if (node.type === "hardBreak") {
    return "  \n";
  }

  if (node.type === "image") {
    const attrs = getNodeAttrs(node);
    const alt = typeof attrs?.alt === "string" ? attrs.alt : "";
    const title = typeof attrs?.title === "string" && attrs.title.length > 0 ? ` \"${attrs.title}\"` : "";
    // An image the app stores has no public URL (the bucket is private), so it
    // exports as an `attachment:` reference. A plain URL exports as itself.
    const attachmentId = typeof attrs?.attachmentId === "string" ? attrs.attachmentId : "";
    const src = typeof attrs?.src === "string" && attrs.src ? attrs.src : attachmentId ? `attachment:${attachmentId}` : "";
    return src ? `![${alt}](${src}${title})` : "";
  }

  if (node.type === "mathInline") {
    const latex = getNodeAttrs(node)?.latex;
    return typeof latex === "string" && latex.length > 0 ? `$${latex}$` : "";
  }

  if (node.type === ENTITY_REF_NODE_TYPE) {
    const label = getNodeAttrs(node)?.label;
    return typeof label === "string" && label.length > 0 ? label : "";
  }

  if (node.type === DATE_TOKEN_NODE_TYPE) {
    const date = getNodeAttrs(node)?.date;
    return typeof date === "string" ? date : "";
  }

  return getNodeContent(node).map((child) => serializeMarkdownInline(child)).join("");
}

function serializeMarkdownBlock(node: unknown): string {
  if (!isRecord(node) || typeof node.type !== "string") {
    return "";
  }

  if (node.type === "paragraph") {
    return getNodeContent(node).map((child) => serializeMarkdownInline(child)).join("");
  }

  if (node.type === "heading") {
    const level = getNodeAttrs(node)?.level;
    const depth = typeof level === "number" ? Math.min(Math.max(level, 1), 6) : 1;
    const text = getNodeContent(node).map((child) => serializeMarkdownInline(child)).join("");
    return `${"#".repeat(depth)} ${text}`.trim();
  }

  if (node.type === "blockquote") {
    return getNodeContent(node)
      .map((child) => serializeMarkdownBlock(child))
      .filter((line) => line.length > 0)
      .map((line) => line.split("\n").map((segment) => `> ${segment}`).join("\n"))
      .join("\n");
  }

  if (node.type === "codeBlock") {
    const language = getNodeAttrs(node)?.language;
    const code = getNodeContent(node).map((child) => serializeMarkdownInline(child)).join("");
    return `\`\`\`${typeof language === "string" ? language : ""}\n${code}\n\`\`\``;
  }

  if (node.type === "horizontalRule") {
    return "---";
  }

  if (node.type === "mathBlock") {
    const latex = getNodeAttrs(node)?.latex;
    return typeof latex === "string" && latex.length > 0 ? `$$${latex}$$` : "";
  }

  if (node.type === "taskList") {
    return getNodeContent(node)
      .filter((child) => isRecord(child) && child.type === "taskItem")
      .map((child) => {
        const attrs = getNodeAttrs(child);
        const checked = attrs?.checked === true;
        const text = getNodeContent(child)
          .map((grandchild) => serializeMarkdownBlock(grandchild))
          .filter((line) => line.length > 0)
          .join(" ")
          .trim();
        return `- [${checked ? "x" : " "}] ${text}`.trimEnd();
      })
      .join("\n");
  }

  // Single-block checkbox (new task model): one taskLine per block.
  if (node.type === "taskLine") {
    const checked = getNodeAttrs(node)?.checked === true;
    const text = getNodeContent(node).map((child) => serializeMarkdownInline(child)).join("").trim();
    return `- [${checked ? "x" : " "}] ${text}`.trimEnd();
  }

  if (node.type === "table") {
    const rows = getNodeContent(node)
      .filter((child) => isRecord(child) && child.type === "tableRow")
      // Escape `|` so a cell's own pipe can't be read as a column separator.
      .map((row) =>
        getNodeContent(row).map((cell) =>
          serializeMarkdownBlock(cell).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim(),
        ),
      );

    if (rows.length === 0) {
      return "";
    }

    const [headerRow, ...bodyRows] = rows;
    const separator = headerRow.map(() => "---");
    return [headerRow, separator, ...bodyRows]
      .map((row) => `| ${row.join(" | ")} |`)
      .join("\n");
  }

  if (node.type === "tableCell" || node.type === "tableHeader") {
    return getNodeContent(node).map((child) => serializeMarkdownBlock(child)).join(" ").trim();
  }

  if (node.type === "image") {
    return serializeMarkdownInline(node);
  }

  return getNodeContent(node).map((child) => serializeMarkdownBlock(child)).join("\n");
}

export function serializeNoteDocumentToMarkdown(raw: unknown) {
  const document = normalizeNoteDocument(raw);
  const content = Array.isArray(document.content) ? document.content : [];
  const markdown = content
    .map((node) => serializeMarkdownBlock(node))
    .filter((value) => value.length > 0)
    .join("\n\n")
    .trim();

  return markdown;
}