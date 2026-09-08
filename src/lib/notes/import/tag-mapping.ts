/**
 * What to do with each tag value the vault uses.
 *
 * In Logseq a tag *is* a page, so `tags:: Books To Read` is both a label and a
 * link — and in a real vault several tag values are also real pages. That's why a
 * value can become a tag, a `[[link]]`, or both, decided per value in the import
 * dialog rather than guessed.
 */

import { normalizeTitleKey } from "@/lib/links/tokens";

import { splitPropertyList } from "./page-properties";

/** A value seen in at least this many files is worth a tag of its own. */
const RECURRENCE_THRESHOLD = 2;

export interface TagDecision {
  /** null → don't tag. Otherwise map to an existing tag or create one. */
  tag: null | { existingId: string } | { createName: string };
  /** Also add a `[[Value]]` link, which is what the value means in Logseq. */
  link: boolean;
}

export type TagSource = "property" | "hashtag";

export interface TagCensusEntry {
  /** Case-insensitive identity, so `#Notion` and `#notion` are one entry. */
  valueId: string;
  label: string;
  variants: string[];
  files: number;
  source: TagSource;
  /** The value is also a page — the case where a link is the truer reading. */
  isPageTitle: boolean;
  /**
   * Set when the name can't be used with the app's `tag:<name>` search prefix.
   * Carries a suggestion; renaming still requires saying so.
   */
  warning: { reason: string; suggestion: string } | null;
  suggested: TagDecision;
}

export interface ExistingTag {
  id: string;
  name: string;
}

export interface TagFileInput {
  /** Raw values from every `tags::`-ish property on the file. */
  tagValues: string[];
  /** Bare `#tag` words found in the body. */
  hashtags: string[];
}

export function buildTagCensus(
  files: readonly TagFileInput[],
  existingTags: readonly ExistingTag[],
  pageTitles: readonly string[],
): TagCensusEntry[] {
  const collected = new Map<string, { spellings: Map<string, number>; files: number; source: TagSource }>();

  const record = (raw: string, source: TagSource, seenInFile: Set<string>) => {
    const label = raw.trim();
    const id = normalizeTitleKey(label);
    if (!id) return;
    const entry = collected.get(id) ?? { spellings: new Map(), files: 0, source };
    entry.spellings.set(label, (entry.spellings.get(label) ?? 0) + 1);
    if (!seenInFile.has(id)) {
      entry.files += 1;
      seenInFile.add(id);
    }
    // A value used as a real tag anywhere outranks an incidental hashtag.
    if (source === "property") entry.source = "property";
    collected.set(id, entry);
  };

  for (const file of files) {
    const seenInFile = new Set<string>();
    for (const value of file.tagValues) {
      for (const item of splitPropertyList(value)) record(item, "property", seenInFile);
    }
    for (const hashtag of file.hashtags) record(hashtag.replace(/^#/, ""), "hashtag", seenInFile);
  }

  const tagByName = new Map(existingTags.map((tag) => [normalizeTitleKey(tag.name), tag]));
  const titleSet = new Set(pageTitles.map((title) => normalizeTitleKey(title)));

  return [...collected.entries()]
    .map(([valueId, entry]) => {
      const variants = [...entry.spellings.entries()].sort((a, b) => b[1] - a[1]).map(([spelling]) => spelling);
      const label = variants[0] ?? valueId;
      const isPageTitle = titleSet.has(valueId);
      return {
        valueId,
        label,
        variants,
        files: entry.files,
        source: entry.source,
        isPageTitle,
        warning: tagNameWarning(label),
        suggested: suggestDecision({ label, files: entry.files, source: entry.source, isPageTitle, tagByName, valueId }),
      };
    })
    .sort((a, b) => b.files - a.files || a.label.localeCompare(b.label));
}

/**
 * The app's search grammar is `tag:<name>`, which stops at a space — so a tag
 * called "personal development" can't be searched for that way.
 */
export function tagNameWarning(name: string): { reason: string; suggestion: string } | null {
  if (!/\s/.test(name.trim())) return null;
  return {
    reason: "Spaces can't be used with the tag: search prefix",
    suggestion: name.trim().replace(/\s+/g, "-").toLowerCase(),
  };
}

function suggestDecision({
  label,
  files,
  source,
  isPageTitle,
  tagByName,
  valueId,
}: {
  label: string;
  files: number;
  source: TagSource;
  isPageTitle: boolean;
  tagByName: Map<string, ExistingTag>;
  valueId: string;
}): TagDecision {
  // An inline hashtag is prose, not a deliberate label — left alone unless asked.
  if (source === "hashtag") return { tag: null, link: false };

  const existing = tagByName.get(valueId);
  if (existing) return { tag: { existingId: existing.id }, link: false };

  // The value is a page: in Logseq that's a label *and* a link, so do both.
  if (isPageTitle) return { tag: { createName: label }, link: true };

  if (files >= RECURRENCE_THRESHOLD) return { tag: { createName: label }, link: false };

  return { tag: null, link: false };
}

/** The five choices the dialog offers, derived from a decision. */
export type TagActionKind = "existing" | "create" | "link" | "both" | "ignore";

export function tagActionKind(decision: TagDecision): TagActionKind {
  if (!decision.tag) return decision.link ? "link" : "ignore";
  if (decision.link) return "both";
  return "existingId" in decision.tag ? "existing" : "create";
}

/** Tag names this mapping will create, deduplicated. */
export function tagNamesToCreate(decisions: Iterable<TagDecision>): string[] {
  const names = new Map<string, string>();
  for (const decision of decisions) {
    if (decision.tag && "createName" in decision.tag) {
      const name = decision.tag.createName.trim();
      // First spelling wins: the census lists the commonest one first.
      const key = normalizeTitleKey(name);
      if (name && !names.has(key)) names.set(key, name);
    }
  }
  return [...names.values()];
}
