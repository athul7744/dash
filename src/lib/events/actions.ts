/**
 * Action-vocabulary helpers — pure, DB-free (like `capture.ts`/`schedule.ts`) so
 * the test suite exercises them without PowerSync. An occurrence's `action`
 * ("what happened": Repaired / Called / Serviced) is a free string; these keep
 * the vocabulary from fragmenting via three local, zero-dep behaviours:
 *   - `caseKey`  — case/whitespace-insensitive key → silent-snap + dedup.
 *   - `stemKey`  — inflection-insensitive key → "did you mean" grouping only.
 *   - fuzzy      — `editDistance` → typo suggestions.
 * The stored surface form is never rewritten by stemming; stems only power
 * suggestions, so a bad stem degrades a hint, never corrupts data.
 */

/** Case/whitespace-normalized key: the safe key for dedup + silent snap. */
export function caseKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Guarded suffix-stem of a single token. Strips common inflections so
 * repair/repaired/repairing collapse, with guards against over-stripping short
 * tokens and `-ss` words. No doubled-consonant collapse (it wrongly split
 * call/called), so a few irregulars stay separate — the fuzzy layer catches those.
 */
function stemToken(t: string): string {
  if (t.length <= 3) return t;
  let s = t;
  if (s.endsWith("ing") && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith("ed") && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith("es") && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith("s") && !s.endsWith("ss") && s.length > 4) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

/** Inflection-insensitive key (per-token stem of `caseKey`). Suggestions only. */
export function stemKey(raw: string): string {
  const c = caseKey(raw);
  if (!c) return "";
  return c.split(" ").map(stemToken).join(" ");
}

/** Levenshtein edit distance (iterative, two-row). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export interface VocabEntry {
  /** Canonical surface form to show/insert. */
  display: string;
  caseKey: string;
  stemKey: string;
  count: number;
}

/**
 * Collapse raw `{action, count}` rows (one per distinct surface form) into a
 * vocabulary keyed by `caseKey`. Canonical `display` = the surface form with the
 * highest count (tiebreak: shortest, then alphabetical). Stem-siblings
 * (Repaired vs Repairing) stay as separate entries — we never merge tenses.
 */
export function buildActionVocabulary(rows: { action: string; count: number }[]): VocabEntry[] {
  const groups = new Map<string, { surface: string; count: number }[]>();
  for (const r of rows) {
    const key = caseKey(r.action);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push({ surface: r.action.trim(), count: r.count });
    groups.set(key, arr);
  }
  const out: VocabEntry[] = [];
  for (const [key, arr] of groups) {
    const total = arr.reduce((n, x) => n + x.count, 0);
    const canonical = arr.slice().sort(
      (a, b) => b.count - a.count || a.surface.length - b.surface.length || a.surface.localeCompare(b.surface),
    )[0].surface;
    out.push({ display: canonical, caseKey: key, stemKey: stemKey(canonical), count: total });
  }
  out.sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));
  return out;
}

export type MatchKind = "exact" | "reuse" | "didYouMean";
export interface RankedMatch {
  entry: VocabEntry;
  kind: MatchKind;
}

/** Edit-distance tolerance scaled to query length (short words tolerate less). */
function fuzzyThreshold(len: number): number {
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
}

/**
 * Rank the vocabulary against the typed query into three buckets:
 *   - `exact`      — same `caseKey` (→ silent snap on commit).
 *   - `reuse`      — the query is a substring of the entry (typeahead reuse).
 *   - `didYouMean` — same `stemKey` (different case-key) or within edit distance
 *                    (→ suggested, never auto-applied).
 * Empty query returns the whole vocabulary as `reuse`, most-used first.
 */
export function rankActionMatches(query: string, vocab: VocabEntry[]): RankedMatch[] {
  const qCase = caseKey(query);
  if (!qCase) return vocab.map((entry) => ({ entry, kind: "reuse" as const }));
  const qStem = stemKey(query);
  const threshold = fuzzyThreshold(qCase.length);

  const ranked: (RankedMatch & { score: number })[] = [];
  for (const entry of vocab) {
    if (entry.caseKey === qCase) {
      ranked.push({ entry, kind: "exact", score: 0 });
    } else if (entry.caseKey.includes(qCase)) {
      ranked.push({ entry, kind: "reuse", score: entry.caseKey.startsWith(qCase) ? 1 : 2 });
    } else {
      const dist = editDistance(qCase, entry.caseKey);
      if (entry.stemKey === qStem || dist <= threshold) {
        ranked.push({ entry, kind: "didYouMean", score: 10 + dist });
      }
    }
  }
  ranked.sort((a, b) => a.score - b.score || b.entry.count - a.entry.count);
  return ranked.map(({ entry, kind }) => ({ entry, kind }));
}
