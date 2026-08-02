/**
 * Pure parsing/manipulation for the command-palette filter tokens: an optional
 * `kind:` filter and an optional `tag:` filter that combine (at most one of
 * each), followed by free-text terms. Kept DB-free and side-effect-free so the
 * add/edit/delete cases are unit-testable.
 */

/** Kind aliases (plurals/synonyms) → canonical kind. */
const KIND_ALIASES: Record<string, string> = {
  note: "note", notes: "note",
  task: "task", tasks: "task", todo: "task", todos: "task",
  bookmark: "bookmark", bookmarks: "bookmark", link: "bookmark", links: "bookmark",
  quote: "quote", quotes: "quote",
  event: "event", events: "event",
};

/** A `kind:`/`type:`/`k:` token being typed at the very end (partial, uncommitted). */
export const KIND_TOKEN_RE = /(?:^|\s)(?:kind|type|k):(\w*)$/i;
/** A `tag:` token being typed at the very end (partial, uncommitted). */
export const TAG_TOKEN_RE = /(?:^|\s)tag:([^\s]*)$/i;

// Global strippers for committed-or-partial tokens (anywhere in the string).
const KIND_ANY_G = /(?:^|\s)(?:kind|type|k):[a-z]*/gi;
const TAG_ANY_G = /(?:^|\s)tag:[^\s]*/gi;

export type FilterChips = { kind: string | null; tag: string | null; terms: string };

/**
 * Extract the committed `kind:` + `tag:` filters (at most one each — extras are
 * ignored) from the leading tokens; the remainder is the free-text terms. A
 * committed token needs a trailing space, so a token still being typed stays in
 * `terms` (where completion can see it). Order-independent (`kind:x tag:y` and
 * `tag:y kind:x` parse the same).
 */
export function parseChips(query: string): FilterChips {
  let rest = query;
  let kind: string | null = null;
  let tag: string | null = null;
  for (;;) {
    const k = rest.match(/^(?:kind|type|k):([a-z]+)\s/i);
    if (k) {
      const canon = KIND_ALIASES[k[1].toLowerCase()];
      if (canon) {
        if (!kind) kind = canon;
        rest = rest.slice(k[0].length);
        continue;
      }
    }
    const t = rest.match(/^tag:([^\s]+)\s/i);
    if (t) {
      if (!tag) tag = t[1];
      rest = rest.slice(t[0].length);
      continue;
    }
    break;
  }
  return { kind, tag, terms: rest };
}

/** Reassemble a query from its parts (each filter token gets a trailing space so it stays "committed"). */
export function buildQuery(kind: string | null, tag: string | null, terms: string): string {
  let out = "";
  if (kind) out += `kind:${kind} `;
  if (tag) out += `tag:${tag} `;
  return out + terms.replace(/^\s+/, "");
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Set (add or replace) the kind filter, preserving any tag + terms. */
export function withKind(query: string, kind: string): string {
  const { tag, terms } = parseChips(query);
  return buildQuery(kind, tag, tidy(terms.replace(KIND_ANY_G, " ")));
}

/** Set (add or replace) the tag filter, preserving any kind + terms. */
export function withTag(query: string, tag: string): string {
  const { kind, terms } = parseChips(query);
  return buildQuery(kind, tag, tidy(terms.replace(TAG_ANY_G, " ")));
}

/** Drop the kind filter, keeping any tag + terms. */
export function removeKind(query: string): string {
  const { tag, terms } = parseChips(query);
  return buildQuery(null, tag, terms);
}

/** Drop the tag filter, keeping any kind + terms. */
export function removeTag(query: string): string {
  const { kind, terms } = parseChips(query);
  return buildQuery(kind, null, terms);
}

/**
 * Rebuild the query after the user edits the terms field (`val` is the visible
 * input text). Any token of an already-active type is stripped so a second
 * kind/tag can't form; a token of an inactive type is left so it can complete.
 */
export function reformOnInput(query: string, val: string): string {
  const { kind, tag } = parseChips(query);
  let cleaned = val;
  if (kind) cleaned = cleaned.replace(KIND_ANY_G, " ");
  if (tag) cleaned = cleaned.replace(TAG_ANY_G, " ");
  return buildQuery(kind, tag, cleaned.replace(/\s+/g, " ").replace(/^\s+/, ""));
}
