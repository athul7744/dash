/**
 * Inline reference-token grammar, shared by every app (notes, tasks, bookmarks,
 * quotes, reminders). A token reads the same wherever it appears:
 *
 *   [[label|kind:id]]   id-bound link to any entity (new inserts always use this)
 *   [[label]]           legacy note-title link, resolved by page title
 *
 * The token lives inline in the field's stored string; `stripRefs` produces the
 * plain label-only text for any surface that renders the string without an editor.
 * Pure and side-effect free so it can be unit tested without a DB or DOM.
 */

export type RefKind = "note" | "task" | "bookmark" | "quote" | "event";

/** ProseMirror node name for an id-bound reference chip (see EntityRefNode). */
export const ENTITY_REF_NODE_TYPE = "entityRef";

/** Tailwind palette hue per entity kind (matches each app's accent). */
export const REF_KIND_HUE: Record<RefKind, string> = {
  note: "amber",
  task: "indigo",
  bookmark: "sky",
  quote: "rose",
  event: "violet",
};

/** CSS accent color for a kind, e.g. `var(--color-indigo-500)`. */
export const refKindAccentVar = (kind: RefKind) => `var(--color-${REF_KIND_HUE[kind]}-500)`;

/** Plural label per kind (headings, legends, cluster pucks). */
export const REF_KIND_LABEL: Record<RefKind, string> = {
  note: "Notes",
  task: "Tasks",
  bookmark: "Bookmarks",
  quote: "Quotes",
  event: "Events",
};

export type RefToken = {
  /** Human label shown in the chip / plain text. */
  label: string;
  /** Present only for id-bound tokens. */
  kind?: RefKind;
  id?: string;
};

const REF_KINDS = "note|task|bookmark|quote|event";

/**
 * A fresh regex each call — a shared global regex carries `lastIndex` state
 * between `matchAll`/`replace`, which bites when the two interleave.
 */
function refTokenRegex(): RegExp {
  // label: no `]` or `|`; optional `|kind:id` suffix (id is a uuid).
  return new RegExp(`\\[\\[([^\\]|]+?)(?:\\|(${REF_KINDS}):([0-9a-fA-F-]+))?\\]\\]`, "g");
}

/** Extract every reference token in document order (duplicates kept; callers dedupe). */
export function parseRefTokens(text: string): RefToken[] {
  if (!text) return [];
  const tokens: RefToken[] = [];
  for (const match of text.matchAll(refTokenRegex())) {
    const label = (match[1] ?? "").trim();
    if (!label) continue;
    if (match[2] && match[3]) {
      tokens.push({ label, kind: match[2] as RefKind, id: match[3] });
    } else {
      tokens.push({ label });
    }
  }
  return tokens;
}

/** Replace every token with its bare label — for command palette, lists, graph labels, etc. */
export function stripRefs(text: string): string {
  if (!text) return "";
  return text.replace(refTokenRegex(), (_full, label: string) => (label ?? "").trim());
}

/** Strip characters that would break the grammar out of a label before it is embedded. */
export function normalizeRefLabel(label: string): string {
  return label.replace(/[[\]|]/g, "").trim().replace(/\s+/g, " ");
}

/** Serialize a token back to its canonical string form. */
export function formatRefToken(token: RefToken): string {
  const label = normalizeRefLabel(token.label) || "Untitled";
  return token.kind && token.id ? `[[${label}|${token.kind}:${token.id}]]` : `[[${label}]]`;
}

/**
 * Build a token from a node's loose attrs (label/kind/id), applying the same
 * defaults everywhere — shared by the entityRef node's `renderText` and the
 * text/markdown serializer.
 */
export function formatRefTokenFromAttrs(attrs: { label?: unknown; kind?: unknown; id?: unknown } | null | undefined): string {
  return formatRefToken({
    label: typeof attrs?.label === "string" && attrs.label ? attrs.label : "Untitled",
    kind: typeof attrs?.kind === "string" ? (attrs.kind as RefKind) : undefined,
    id: typeof attrs?.id === "string" ? attrs.id : undefined,
  });
}

/** Normalized key for legacy title matching (case/whitespace-insensitive). */
export function normalizeTitleKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export type RefSegment =
  | { type: "text"; text: string }
  | { type: "ref"; kind: RefKind; id: string; label: string };

/**
 * Split a string into text runs and **id-bound** ref segments, in order. Used by
 * RefField to build an editor doc (id tokens → chip nodes; everything else,
 * including bare `[[Title]]`, stays literal text).
 */
export function parseRefSegments(text: string): RefSegment[] {
  const segments: RefSegment[] = [];
  const regex = new RegExp(`\\[\\[([^\\]|]+?)\\|(${REF_KINDS}):([0-9a-fA-F-]+)\\]\\]`, "g");
  let last = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", text: text.slice(last, index) });
    segments.push({ type: "ref", kind: match[2] as RefKind, id: match[3], label: (match[1] ?? "").trim() });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}
