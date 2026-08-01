/**
 * Pure helpers that turn raw user input into safe SQL. No DB import (type-only),
 * so these stay unit-testable in a plain node environment.
 */

import type { RefKind } from "@/lib/links/tokens";

/**
 * Build an FTS5 MATCH expression: keep only letters/numbers (drops every FTS
 * operator like `"`, `*`, `:`, `-`, `AND`/`OR` punctuation), then prefix-match
 * each token so partial words hit (`meeting me` → `meeting* me*`, implicit AND).
 * Returns "" when nothing usable remains.
 */
export function toMatchQuery(raw: string): string {
  const tokens = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((t) => `${t}*`).join(" ");
}

// --- Query grammar: kind: filters, "exact phrases", free terms ---

const KIND_ALIASES: Record<string, RefKind> = {
  note: "note", notes: "note",
  task: "task", tasks: "task", todo: "task", todos: "task",
  bookmark: "bookmark", bookmarks: "bookmark", link: "bookmark", links: "bookmark",
  quote: "quote", quotes: "quote",
  event: "event", events: "event",
};

export type ParsedQuery = { kinds: RefKind[]; phrases: string[]; terms: string[] };

const tokenize = (s: string): string[] => s.match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Split raw input into a `kind:` filter, `"exact phrases"`, and free terms.
 * `kind:note` / `type:tasks` / `k:link` (+ plurals/synonyms) set the kind filter;
 * quoted runs become exact phrases; everything else is a fuzzy/prefix term.
 * Unknown `kind:` values are left as ordinary text rather than silently dropped.
 */
export function parseSearchQuery(raw: string): ParsedQuery {
  const kinds = new Set<RefKind>();
  const phrases: string[] = [];
  let rest = raw;

  rest = rest.replace(/"([^"]+)"/g, (_m, p: string) => {
    const t = p.trim();
    if (t) phrases.push(t);
    return " ";
  });
  rest = rest.replace(/\b(?:kind|type|k):([a-zA-Z]+)/g, (m, k: string) => {
    const kind = KIND_ALIASES[k.toLowerCase()];
    if (kind) {
      kinds.add(kind);
      return " ";
    }
    return m;
  });

  return { kinds: [...kinds], phrases, terms: tokenize(rest.toLowerCase()) };
}

/**
 * FTS5 MATCH from a parsed query: exact phrases as adjacency-locked `"a b"`,
 * free terms as prefixes `t*`, all ANDed. Empty when there's no text to match.
 */
export function buildMatch(parsed: ParsedQuery): string {
  const parts: string[] = [];
  for (const p of parsed.phrases) {
    const toks = tokenize(p);
    if (toks.length) parts.push(`"${toks.join(" ")}"`);
  }
  for (const t of parsed.terms) parts.push(`${t}*`);
  return parts.join(" ");
}

// --- Fuzzy (typo-tolerant) title matching, used when FTS finds nothing ---

/** Levenshtein edit distance (small strings; full DP is fine). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** How many edits a term of this length may differ by (short terms stay exact). */
export function fuzzyThreshold(len: number): number {
  return len <= 3 ? 0 : len <= 5 ? 1 : 2;
}

function markRanges(text: string, ranges: Array<[number, number]>): string {
  if (!ranges.length) return text;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let out = "";
  let pos = 0;
  for (const [s, e] of merged) {
    out += text.slice(pos, s) + HL_START + text.slice(s, e) + HL_END;
    pos = e;
  }
  return out + text.slice(pos);
}

/**
 * Fuzzy-match a title against free terms: every term must match some title token
 * within its edit-distance threshold (a prefix counts as exact, mirroring FTS).
 * Returns the summed distance (for ranking) and the title with matched tokens
 * marked, or null if any term can't be matched.
 */
export function fuzzyMatchTitle(title: string, terms: string[]): { distance: number; marked: string } | null {
  if (!terms.length) return null;
  const tokens = [...title.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    lower: m[0].toLowerCase(),
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  if (!tokens.length) return null;

  const ranges: Array<[number, number]> = [];
  let distance = 0;
  for (const term of terms) {
    const th = fuzzyThreshold(term.length);
    let best = Infinity;
    let bestTok: (typeof tokens)[number] | null = null;
    for (const tok of tokens) {
      const d = tok.lower === term || tok.lower.startsWith(term) ? 0 : levenshtein(tok.lower, term);
      if (d < best) {
        best = d;
        bestTok = tok;
      }
      if (best === 0) break;
    }
    if (best > th) return null;
    distance += best;
    if (bestTok) ranges.push([bestTok.start, bestTok.end]);
  }
  return { distance, marked: markRanges(title, ranges) };
}

/** Escape LIKE wildcards for the 1-char fallback (used with `ESCAPE '\'`). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Private-use sentinels wrapped around matched text by FTS5 highlight()/snippet()
// (or markLike below). The renderer splits on them; they never appear in content.
export const HL_START = "";
export const HL_END = "";

/** Split marked text into runs, flagging which runs are matches, for rendering. */
export function toHighlightSegments(marked: string): Array<{ text: string; hit: boolean }> {
  const out: Array<{ text: string; hit: boolean }> = [];
  let rest = marked;
  while (rest.length) {
    const start = rest.indexOf(HL_START);
    if (start === -1) {
      out.push({ text: rest, hit: false });
      break;
    }
    if (start > 0) out.push({ text: rest.slice(0, start), hit: false });
    const end = rest.indexOf(HL_END, start + 1);
    if (end === -1) {
      out.push({ text: rest.slice(start + 1), hit: true });
      break;
    }
    out.push({ text: rest.slice(start + 1, end), hit: true });
    rest = rest.slice(end + 1);
  }
  return out;
}

/** Remove markers — for surfaces that show the text plain (e.g. the `[[` picker). */
export function stripHighlight(s: string): string {
  return s.split(HL_START).join("").split(HL_END).join("");
}

/** Mark the first case-insensitive occurrence of `q` in `text` (LIKE fallback path). */
export function markLike(text: string, q: string): string {
  if (!text || !q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + HL_START + text.slice(idx, idx + q.length) + HL_END + text.slice(idx + q.length);
}
