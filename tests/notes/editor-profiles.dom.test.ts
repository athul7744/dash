/// <reference types="vitest/globals" />

/**
 * The editor ships in two profiles: the notes editor with syntax-highlighted code,
 * and the journal's, which leaves the highlighter out (a tracker week can mount
 * seven entries at once).
 *
 * Two things must hold, and they pull in opposite directions: the journal must not
 * carry the highlighter, and it must still understand every node a journal block
 * can store — a `[[ref]]`, a `{date}` chip, a pasted table, an image, `$math$`.
 * A node type missing from the schema makes that stored content unparseable.
 */

// The shared list attaches an image NodeView, which resolves stored files through
// the PowerSync client — jsdom has no Worker.
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn(), getAll: vi.fn() } }));

import { JOURNAL_EDITOR_EXTENSIONS } from "@/lib/notes/editor/extensions-journal";
import { NOTE_EDITOR_EXTENSIONS } from "@/lib/notes/editor/extensions";

const names = (list: typeof NOTE_EDITOR_EXTENSIONS) => list.map((extension) => extension.name);

describe("journal editor profile", () => {
  it("keeps refs and date chips — the two things a journal writes in", () => {
    expect(names(JOURNAL_EDITOR_EXTENSIONS)).toEqual(expect.arrayContaining(["entityRef", "dateToken"]));
  });

  it("leaves the syntax highlighter out, keeping the node", () => {
    // Both profiles name the node `codeBlock` (one extends the other); the
    // difference is the grammar registry the highlighted one is configured with.
    const journalCode = JOURNAL_EDITOR_EXTENSIONS.find((extension) => extension.name === "codeBlock");
    const notesCode = NOTE_EDITOR_EXTENSIONS.find((extension) => extension.name === "codeBlock");

    expect(journalCode).toBeDefined();
    expect((journalCode as { options?: { lowlight?: unknown } }).options?.lowlight).toBeUndefined();
    expect((notesCode as { options?: { lowlight?: unknown } }).options?.lowlight).toBeDefined();
  });

  it("still parses everything a journal block can hold", () => {
    // Stored content, not the slash menu: a table or image pasted in months ago
    // has to load, even though the journal cannot create one from scratch.
    expect(names(JOURNAL_EDITOR_EXTENSIONS)).toEqual(
      expect.arrayContaining(["table", "tableRow", "tableCell", "image", "mathBlock", "mathInline", "taskLine", "blockquote"]),
    );
  });

  it("is the same schema as the notes editor, minus the highlighter", () => {
    // One shared list with one node swapped: no other difference may creep in, or
    // the two editors would disagree about what a stored block can hold.
    expect([...names(NOTE_EDITOR_EXTENSIONS)].sort()).toEqual([...names(JOURNAL_EDITOR_EXTENSIONS)].sort());
  });
});
