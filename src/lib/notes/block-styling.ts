import { normalizeNoteDocument } from "@/lib/notes/notes-content";
import type { BlockColorKey } from "@/components/notes/NoteBlockEditorColor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlockSpacingMeta = {
  kind: "heading" | "hr" | "other";
  headingLevel?: 1 | 2 | 3 | 4 | 5;
};

export const defaultBlockSpacingMeta: BlockSpacingMeta = { kind: "other" };

// ---------------------------------------------------------------------------
// Block content inspection
// ---------------------------------------------------------------------------

export function getBlockSpacingMeta(raw: string | null | undefined): BlockSpacingMeta {
  const document = normalizeNoteDocument(raw);
  const firstNode = Array.isArray(document.content) ? document.content[0] : null;

  if (!firstNode || typeof firstNode !== "object" || !("type" in firstNode)) {
    return { kind: "other" };
  }

  if (firstNode.type === "horizontalRule") {
    return { kind: "hr" };
  }

  if (firstNode.type === "heading") {
    const level = typeof firstNode.attrs === "object" && firstNode.attrs && "level" in firstNode.attrs
      ? firstNode.attrs.level
      : null;

    if (level === 1 || level === 2 || level === 3 || level === 4 || level === 5) {
      return { kind: "heading", headingLevel: level };
    }
  }

  return { kind: "other" };
}

const VALID_BLOCK_COLORS = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink"]);

export function getBlockColor(raw: string | null | undefined): BlockColorKey | null {
  const document = normalizeNoteDocument(raw);
  const firstNode = Array.isArray(document.content) ? document.content[0] : null;

  if (!firstNode || typeof firstNode !== "object" || !("attrs" in firstNode)) {
    return null;
  }

  const attrs = firstNode.attrs;
  if (attrs && typeof attrs === "object" && "color" in attrs && typeof attrs.color === "string" && VALID_BLOCK_COLORS.has(attrs.color)) {
    return attrs.color as BlockColorKey;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Heading styling
// ---------------------------------------------------------------------------

export function getHeadingOffsetPx(level: 1 | 2 | 3 | 4 | 5) {
  switch (level) {
    case 1:
      return -1;
    case 2:
      return -2;
    case 3:
      return -4;
    case 4:
      return -5;
    case 5:
      return -6;
  }
}

export function getHeadingAccentColor(level: 1 | 2 | 3 | 4 | 5) {
  switch (level) {
    case 1:
      return "color-mix(in oklab, #f5e0dc 48%, var(--color-foreground))";
    case 2:
      return "color-mix(in oklab, #cba6f7 38%, var(--color-foreground))";
    case 3:
      return "color-mix(in oklab, #89b4fa 26%, var(--color-foreground))";
    case 4:
      return "color-mix(in oklab, #94e2d5 14%, var(--color-foreground))";
    case 5:
      return "color-mix(in oklab, #bac2de 20%, var(--color-muted-foreground))";
  }
}

export function getHeadingDividerOpacity(level: 1 | 2 | 3 | 4 | 5) {
  return level === 1 ? 0.18 : level === 2 ? 0.20 : level === 3 ? 0.22 : level === 4 ? 0.24 : 0.28;
}

export function getHeadingDividerColor(level: 1 | 2 | 3 | 4 | 5) {
  return getHeadingAccentColor(level);
}

export function getHeadingTreeLineColor(level: 1 | 2 | 3 | 4 | 5) {
  const opacity = getHeadingDividerOpacity(level);
  return `color-mix(in oklab, ${getHeadingAccentColor(level)} ${Math.round(opacity * 100)}%, transparent)`;
}

export function blockEndsWithDividerLine(meta: BlockSpacingMeta) {
  return meta.kind === "hr" || meta.kind === "heading";
}
