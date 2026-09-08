/**
 * What to do with each `key:: value` the vault uses.
 *
 * A real vault's properties are structured data — a library with Author, Status,
 * date, name — not noise, so burying them in an invisible JSON blob loses the most
 * useful thing in the export. This module censuses the keys and proposes an action
 * per key; the import dialog shows that and lets it be overridden, so nothing is
 * decided silently at write time.
 */

import type { PropertyType } from "@/components/notes/page/types";

import { builtinFieldFor, cleanPropertyValue, parseLogseqDate, propertyKeyId, splitPropertyList } from "./page-properties";
import type { BuiltinPropertyField } from "./page-properties";

/** A key appearing in at least this many files is worth a real property. */
const RECURRENCE_THRESHOLD = 3;

/**
 * Logseq's own bookkeeping. These recur often enough to pass the threshold, but
 * they describe how Logseq drew the page — not anything about its content — so
 * they default to ignored rather than becoming properties you have to clean up.
 */
const INTERNAL_KEYS = new Set([
  "id",
  "collapsed",
  "heading",
  "banner-repeat",
  "title-align",
  "public",
  "filters",
  "query-table",
  "query-properties",
  "query-sort-by",
  "query-sort-desc",
  "logseq.order-list-type",
  "card-last-interval",
  "card-repeats",
  "card-ease-factor",
  "card-next-schedule",
  "card-last-reviewed",
  "card-last-score",
]);
/** Above this many distinct values, a fixed option list stops being meaningful. */
const MAX_SELECT_OPTIONS = 8;
const MAX_SAMPLE_VALUES = 24;

export type PropertyAction =
  /** Straight into a field the notes app already has (title, tags, emoji, …). */
  | { kind: "builtin"; field: BuiltinPropertyField }
  /** Onto a property definition that already exists. */
  | { kind: "existing"; definitionId: string }
  /** A new definition, name and type both overridable. */
  | { kind: "create"; name: string; type: PropertyType; options: string[] }
  /** Kept in `properties.importedFrontmatter` — stored, not shown. */
  | { kind: "ignore" };

export interface PropertyCensusEntry {
  /** Case-insensitive identity: `Tags` and `tags` are one entry. */
  keyId: string;
  /** How it reads in the UI — the spelling used most often. */
  label: string;
  /** Every spelling seen, for a "Tags/tags" style hint. */
  variants: string[];
  files: number;
  /** Cleaned distinct values, capped. */
  values: string[];
  suggested: PropertyAction;
}

export interface ExistingDefinition {
  id: string;
  name: string;
  type: PropertyType;
}

export interface PropertyFileInput {
  properties: Array<{ key: string; value: string }>;
}

/**
 * Census every property key across the selected files, with a suggested action.
 *
 * Suggestions, in order: a key the app has a field for wins; then a definition
 * that already exists under the same name (so a second import doesn't duplicate
 * it); then recurring keys get a new definition with an inferred type; one-offs
 * are ignored.
 */
export function buildPropertyCensus(
  files: readonly PropertyFileInput[],
  existing: readonly ExistingDefinition[],
): PropertyCensusEntry[] {
  const byId = new Map<string, { spellings: Map<string, number>; files: number; values: Set<string> }>();

  for (const file of files) {
    const seenInFile = new Set<string>();
    for (const { key, value } of file.properties) {
      const id = propertyKeyId(key);
      if (!id) continue;
      const entry = byId.get(id) ?? { spellings: new Map(), files: 0, values: new Set() };
      entry.spellings.set(key, (entry.spellings.get(key) ?? 0) + 1);
      if (!seenInFile.has(id)) {
        entry.files += 1;
        seenInFile.add(id);
      }
      for (const item of splitPropertyList(value)) {
        if (entry.values.size < MAX_SAMPLE_VALUES) entry.values.add(item);
      }
      if (entry.values.size === 0) {
        const single = cleanPropertyValue(value);
        if (single) entry.values.add(single);
      }
      byId.set(id, entry);
    }
  }

  const definitionByName = new Map(existing.map((definition) => [propertyKeyId(definition.name), definition]));

  return [...byId.entries()]
    .map(([keyId, entry]) => {
      const variants = [...entry.spellings.entries()].sort((a, b) => b[1] - a[1]).map(([spelling]) => spelling);
      const label = variants[0] ?? keyId;
      const values = [...entry.values];
      return {
        keyId,
        label,
        variants,
        files: entry.files,
        values,
        suggested: suggestAction({ keyId, label, files: entry.files, values, definitionByName }),
      };
    })
    .sort((a, b) => b.files - a.files || a.label.localeCompare(b.label));
}

function suggestAction({
  keyId,
  label,
  files,
  values,
  definitionByName,
}: {
  keyId: string;
  label: string;
  files: number;
  values: string[];
  definitionByName: Map<string, ExistingDefinition>;
}): PropertyAction {
  const builtin = builtinFieldFor(keyId);
  if (builtin) return { kind: "builtin", field: builtin };

  if (INTERNAL_KEYS.has(keyId)) return { kind: "ignore" };

  const match = definitionByName.get(keyId);
  if (match) return { kind: "existing", definitionId: match.id };

  if (files >= RECURRENCE_THRESHOLD) {
    const type = inferPropertyType(values, files);
    return { kind: "create", name: label, type, options: type === "select" ? values : [] };
  }

  return { kind: "ignore" };
}

/** Best-guess type from the values themselves. */
export function inferPropertyType(values: readonly string[], files: number): PropertyType {
  const present = values.filter((value) => value.length > 0);
  if (present.length === 0) return "text";

  if (present.every((value) => parseLogseqDate(value) !== null)) return "date";
  if (present.every((value) => /^(true|false|yes|no)$/i.test(value))) return "checkbox";
  if (present.every((value) => /^https?:\/\//i.test(value))) return "url";
  if (present.every((value) => /^-?\d+(\.\d+)?$/.test(value))) return "number";
  // A small closed set that several files share is a select; a wide open set
  // (every book has a different author) is just text.
  if (present.length <= MAX_SELECT_OPTIONS && files >= RECURRENCE_THRESHOLD) return "select";
  return "text";
}

/** The value to store for a mapped property, given its type. */
export function propertyValueFor(type: PropertyType, raw: string): string | number | boolean | null {
  const value = cleanPropertyValue(raw);
  if (!value) return null;
  if (type === "date") return parseLogseqDate(value);
  if (type === "checkbox") return /^(true|yes)$/i.test(value);
  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return value;
}
