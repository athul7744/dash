"use client";

import type { NoteBlockRow } from "@/hooks/use-notes";
import type { Tag } from "@/lib/powersync/AppSchema";
import { normalizeNoteDocument, parseSerializedRecord } from "@/lib/notes/notes-content";
import type { JsonValue } from "@/lib/notes/notes";
import { formatRelativeTime } from "@/lib/shared/utils";
import { TAG_COLORS } from "@/lib/tasks/colors";

import type { NoteTag, OutlineEntry } from "./types";

type RichContentNode = {
  type?: string;
  text?: string;
  attrs?: {
    level?: number;
  };
  content?: RichContentNode[];
};

export function formatTimestampLabel(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    relative: formatRelativeTime(date),
    dateOnly: date.toLocaleDateString([], { dateStyle: "medium" }),
    absolute: date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
  };
}

function extractTextFromRichContent(node: RichContentNode | null | undefined): string {
  if (!node) return "";

  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = Array.isArray(node.content)
    ? node.content.map((child) => extractTextFromRichContent(child)).join("")
    : "";

  return `${ownText}${childText}`;
}

function collectOutlineHeadings(node: RichContentNode | null | undefined, headings: Array<{ level: number; text: string }>) {
  if (!node) return;

  if (node.type === "heading") {
    const text = extractTextFromRichContent(node).trim();
    if (text) {
      headings.push({
        level: typeof node.attrs?.level === "number" ? node.attrs.level : 1,
        text,
      });
    }
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectOutlineHeadings(child, headings));
  }
}

export function extractOutlineEntries(blockId: string, rawContent: string | null | undefined): OutlineEntry[] {
  if (!rawContent) return [];

  try {
    const parsed = normalizeNoteDocument(rawContent) as RichContentNode;
    const headings: Array<{ level: number; text: string }> = [];
    collectOutlineHeadings(parsed, headings);

    return headings.map((heading) => ({
      blockId,
      indentLevel: 0,
      level: Math.min(Math.max(heading.level, 1), 5),
      text: heading.text,
    }));
  } catch {
    return [];
  }
}

function getOutlineIndentLevels(blocks: Pick<NoteBlockRow, "id" | "parent_block_id">[]) {
  const parentById = new Map(blocks.map((block) => [block.id, block.parent_block_id ?? null]));
  const depthById = new Map<string, number>();

  const resolveDepth = (blockId: string, visiting = new Set<string>()): number => {
    const cachedDepth = depthById.get(blockId);
    if (cachedDepth !== undefined) {
      return cachedDepth;
    }

    if (visiting.has(blockId)) {
      depthById.set(blockId, 0);
      return 0;
    }

    const parentBlockId = parentById.get(blockId);
    if (!parentBlockId || !parentById.has(parentBlockId)) {
      depthById.set(blockId, 0);
      return 0;
    }

    visiting.add(blockId);
    const depth = resolveDepth(parentBlockId, visiting) + 1;
    visiting.delete(blockId);
    depthById.set(blockId, depth);
    return depth;
  };

  blocks.forEach((block) => {
    resolveDepth(block.id);
  });

  return depthById;
}

export function buildOutlineEntries(blocks: Pick<NoteBlockRow, "id" | "content" | "parent_block_id">[]): OutlineEntry[] {
  const indentLevels = getOutlineIndentLevels(blocks);

  return blocks.flatMap((block) => extractOutlineEntries(block.id, block.content).map((entry) => ({
    ...entry,
    indentLevel: indentLevels.get(block.id) ?? 0,
  })));
}

export function attachmentLabel(filePath: string | null | undefined) {
  if (!filePath) return "Attachment";

  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? filePath;
}

export function createBlockDocument(text = ""): JsonValue {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text.trim().length > 0 ? [{ type: "text", text }] : [],
      },
    ],
  };
}

export function parseProperties(raw: unknown) {
  return parseSerializedRecord(raw) ?? {};
}

export function parseStoredTagIds(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seenIds = new Set<string>();

  return raw.flatMap((value) => {
    if (typeof value !== "string") {
      return [];
    }

    const trimmedValue = value.trim();
    if (!trimmedValue || seenIds.has(trimmedValue)) {
      return [];
    }

    seenIds.add(trimmedValue);
    return [trimmedValue];
  });
}

export function resolveNoteTags(tagIds: string[], availableTags: Tag[]): NoteTag[] {
  const tagsById = new Map(availableTags.map((tag) => [tag.id, tag]));

  return tagIds.flatMap((tagId) => {
    const tag = tagsById.get(tagId);
    if (!tag) {
      return [];
    }

    return [{
      id: tag.id,
      key: tag.id,
      name: tag.name?.trim() || "Tag",
      color: tag.color || "slate",
    }];
  });
}

export function getDeterministicTagColor(tag: string | null | undefined) {
  const normalizedTag = (tag ?? "").trim().toLocaleLowerCase();
  if (!normalizedTag) {
    return null;
  }

  let hash = 0;
  for (const character of normalizedTag) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return TAG_COLORS[hash % TAG_COLORS.length] ?? null;
}

export function normalizePageEmoji(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}