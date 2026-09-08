/**
 * Logseq markdown → plain markdown.
 *
 * Logseq is an outliner, which is the same shape this editor uses: a bullet's
 * own line becomes a block and its extra content nests underneath. That mapping
 * already works (`listItemBlock` in markdown-paste.ts), so nothing structural
 * happens here — this module only rewrites the syntax Logseq adds on top, then
 * hands the result to the existing parser.
 *
 * What it cannot represent it leaves alone and *counts*, so the import UI can
 * tell you which files need a second look instead of quietly dropping content.
 */

/** A construct we recognise but don't translate. Surfaced per file in the picker. */
export type LogseqNoteKind =
  | "query"
  | "video"
  | "blockRef"
  | "hashtag"
  | "drawer"
  | "orgBlock"
  | "priority";

export interface LogseqNote {
  kind: LogseqNoteKind;
  count: number;
}

export interface NormalizedLogseqFile {
  /** Markdown ready for `markdownToBlockNodes`. */
  body: string;
  /** Raw page properties from the leading `key:: value` block, in file order. */
  properties: Array<{ key: string; value: string }>;
  /** Recognised-but-untranslated constructs, most frequent first. */
  notes: LogseqNote[];
  /** Embeds rewritten to plain links — reported so the change is visible. */
  embedsLinked: number;
  /** Distinct `#tag` words in the body, so the tag mapping can offer them. */
  hashtags: string[];
}

const PROPERTY_LINE = /^([A-Za-z][A-Za-z0-9_-]*)::[ \t]*(.*)$/;
const FENCE = /^[ \t]*(```|~~~)/;

const TODO_OPEN = ["TODO", "DOING", "NOW", "LATER", "WAITING", "IN-PROGRESS"];
const TODO_DONE = ["DONE", "CANCELED", "CANCELLED"];
const TASK_MARKER = new RegExp(`^([ \t]*-[ \t]+)(${[...TODO_OPEN, ...TODO_DONE].join("|")})[ \t]+(.*)$`);

/** Strip an optional leading bullet so a `- key:: value` line still reads as a property. */
function withoutBullet(line: string): string {
  return line.replace(/^[ \t]*-[ \t]+/, "").trim();
}

/**
 * Split the leading page-property block off the top of the file.
 *
 * Only the very top counts: Logseq writes page properties on the first line, and
 * an identical-looking line further down is a block property (or prose) and is
 * handled by the body pass instead.
 */
function splitLeadingProperties(lines: string[]): {
  properties: Array<{ key: string; value: string }>;
  rest: string[];
} {
  const properties: Array<{ key: string; value: string }> = [];
  let index = 0;

  while (index < lines.length && lines[index].trim() === "") index += 1;

  for (; index < lines.length; index += 1) {
    const candidate = withoutBullet(lines[index]);
    if (candidate === "") {
      // A blank inside the property block is a separator; stop only if what
      // follows isn't another property.
      const next = lines[index + 1] === undefined ? "" : withoutBullet(lines[index + 1]);
      if (!PROPERTY_LINE.test(next)) {
        index += 1;
        break;
      }
      continue;
    }
    const match = PROPERTY_LINE.exec(candidate);
    if (!match) break;
    properties.push({ key: match[1], value: match[2].trim() });
  }

  return { properties, rest: lines.slice(index) };
}

export function normalizeLogseqMarkdown(text: string): NormalizedLogseqFile {
  const counts = new Map<LogseqNoteKind, number>();
  const bump = (kind: LogseqNoteKind, by = 1) => {
    if (by > 0) counts.set(kind, (counts.get(kind) ?? 0) + by);
  };

  const { properties, rest } = splitLeadingProperties(text.replace(/\r\n?/g, "\n").split("\n"));

  let embedsLinked = 0;
  const hashtags = new Set<string>();
  let inFence = false;
  const out: string[] = [];

  for (const raw of rest) {
    if (FENCE.test(raw)) {
      inFence = !inFence;
      out.push(raw);
      continue;
    }
    // Inside a fence every line is content the user wrote deliberately.
    if (inFence) {
      out.push(raw);
      continue;
    }

    // Block-level `key:: value` — Logseq bookkeeping (id, collapsed, query
    // config). Dropped: imported as-is it reads as junk text.
    if (PROPERTY_LINE.test(raw.trim()) || PROPERTY_LINE.test(withoutBullet(raw))) {
      continue;
    }

    let line = raw;

    // Drawers and org blocks have no equivalent; keep the text but flag the file.
    // Both usually sit inside a bullet, so the bullet prefix is optional.
    if (/^[ \t]*(?:-[ \t]+)?:(?:LOGBOOK|END|PROPERTIES):/.test(line)) bump("drawer");
    if (/^[ \t]*(?:-[ \t]+)?#\+(?:BEGIN|END)_/i.test(line)) bump("orgBlock");

    // `- TODO foo` → a real checkbox. The marker word carries no other meaning.
    const task = TASK_MARKER.exec(line);
    if (task) {
      const box = TODO_DONE.includes(task[2]) ? "[x]" : "[ ]";
      line = `${task[1]}${box} ${task[3]}`;
    }

    // `{{embed [[X]]}}` → `[[X]]`: transclusion doesn't exist here, and a link
    // keeps the connection (backlink + graph edge) instead of leaving macro text.
    line = line.replace(/\{\{embed[ \t]+(\[\[[^\]]+\]\])[ \t]*\}\}/g, (_full, link: string) => {
      embedsLinked += 1;
      return link;
    });

    // `![[file]]` → a normal image reference.
    line = line.replace(/!\[\[([^\]]+)\]\]/g, (_full, target: string) => `![](${target})`);

    bump("query", countMatches(line, /\{\{query\b/g));
    bump("video", countMatches(line, /\{\{(video|youtube|tweet|renderer|cloze)\b/g));
    bump("blockRef", countMatches(line, /\(\([0-9a-fA-F-]{36}\)\)/g));
    const tagMatches = [...line.matchAll(/(^|[\s(])#([A-Za-z][\w/-]*)/g)];
    for (const match of tagMatches) hashtags.add(match[2]);
    bump("hashtag", tagMatches.length);
    bump("priority", countMatches(line, /\[#[ABC]\]/g));

    out.push(line);
  }

  const notes = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

  return { body: out.join("\n").trim(), properties, notes, embedsLinked, hashtags: [...hashtags] };
}

function countMatches(line: string, pattern: RegExp): number {
  return [...line.matchAll(pattern)].length;
}

const NOTE_LABELS: Record<LogseqNoteKind, string> = {
  query: "query",
  video: "macro",
  blockRef: "block ref",
  hashtag: "hashtag",
  drawer: "drawer",
  orgBlock: "org block",
  priority: "priority",
};

/** "2 block refs, 1 query" — the hover detail behind a file's status. */
export function describeNotes(notes: LogseqNote[]): string {
  return notes
    .map(({ kind, count }) => `${count} ${NOTE_LABELS[kind]}${count === 1 ? "" : "s"}`)
    .join(", ");
}
