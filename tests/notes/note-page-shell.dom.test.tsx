/// <reference types="vitest/globals" />

/**
 * Integration test for the reworked NotePageShell (Phase 7d): with the legacy
 * block store gone, the shell derives ordered blocks + the heading outline from
 * the row set and forwards them, mounting the single editor (not the skeleton).
 * NotesEditorContent is stubbed to capture what the shell hands it.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { NotePageShellHandle } from "@/components/notes/page/NotePageShell";
import type { NoteBlockRow, NotePageRow } from "@/hooks/use-notes";
import { serializeNoteDocument } from "@/lib/notes/notes-content";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPageData: { page: NotePageRow | null; blocks: NoteBlockRow[]; isLoading: boolean } = { page: null, blocks: [], isLoading: true };
const empty = { isLoading: false };

vi.mock("@/hooks/use-notes", () => ({
  useNotePageWithBlocks: () => mockPageData,
  usePageAttachments: () => ({ attachments: [], ...empty }),
  useLinkedNoteReferences: () => ({ references: [], ...empty }),
  usePageTagMentions: () => ({ tags: [], ...empty }),
}));
vi.mock("@powersync/react", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/hooks/use-property-definitions", () => ({ usePropertyDefinitions: () => ({ definitions: [], isLoading: false }) }));
vi.mock("@/hooks/use-settled-timestamp", () => ({
  useSettledTimestamp: () => ({ stableUpdatedTimestamp: null, showAbsoluteUpdatedTime: false, revealAbsoluteUpdatedTime: () => {}, resetTimestamp: () => {} }),
}));
vi.mock("@/lib/notes/notes", () => ({
  deletePage: vi.fn(async () => undefined),
  updatePageProperties: vi.fn(),
  updatePageTitle: vi.fn(),
  normalizeNotePageTitle: (t: string) => t.trim(),
}));
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(async () => undefined) } }));

// Stub the editor content so we capture the props the shell forwards without
// mounting the full editor tree.
let lastEditorContent: { blocks: NoteBlockRow[]; blockCount: number } | null = null;
vi.mock("@/components/notes/page/NotesEditorContent", () => ({
  NotesEditorContent: ({ editorContent }: { editorContent: { blocks: NoteBlockRow[]; blockCount: number } }) => {
    lastEditorContent = editorContent;
    return React.createElement("div", { "data-testid": "editor-content" }, "editor");
  },
}));
vi.mock("@/components/notes/NotesPageSkeleton", () => ({
  NotesEditorMainSkeleton: () => React.createElement("div", { "data-testid": "skeleton" }),
}));

function page(id: string): NotePageRow {
  return { id, user_id: "u1", title: "Project", properties: "{}", created_at: "2026-07-18T00:00:00.000Z", updated_at: "2026-07-18T00:00:00.000Z" };
}
function block(id: string, node: unknown, over: Partial<NoteBlockRow> = {}): NoteBlockRow {
  return { id, user_id: "u1", page_id: "page-1", parent_block_id: null, type: "text", content: serializeNoteDocument({ type: "doc", content: [node] }), sort_rank: "a0", updated_at: "2026-07-18T00:00:00.000Z", ...over };
}

async function renderShell() {
  const { NotePageShell } = await import("@/components/notes/page/NotePageShell");
  const container = document.createElement("div");
  let handle: NotePageShellHandle | null = null;
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(NotePageShell, {
      pageId: "page-1",
      notePageTitles: [],
      notePageIdByTitle: new Map<string, string>(),
      onNavigateToPage: vi.fn(),
      onDeleteSuccess: vi.fn(),
      onStateChange: (h: NotePageShellHandle) => { handle = h; },
    }));
  });
  await act(async () => { await Promise.resolve(); });
  return { container, root: root!, getHandle: () => handle };
}

afterEach(() => {
  mockPageData = { page: null, blocks: [], isLoading: true };
  lastEditorContent = null;
});

describe("NotePageShell (single-editor)", () => {
  it("derives ordered blocks + heading outline and mounts the editor", async () => {
    mockPageData = {
      page: page("page-1"),
      isLoading: false,
      blocks: [
        block("b2", { type: "paragraph", content: [{ type: "text", text: "Intro" }] }, { sort_rank: "a1" }),
        block("b1", { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Heading" }] }, { sort_rank: "a0" }),
        block("b3", { type: "paragraph", content: [{ type: "text", text: "Nested" }] }, { parent_block_id: "b2", sort_rank: "a0" }),
      ],
    };
    const { container, root, getHandle } = await renderShell();

    // Reached the editor, not the loading skeleton.
    expect(container.querySelector("[data-testid=editor-content]")).not.toBeNull();
    expect(container.querySelector("[data-testid=skeleton]")).toBeNull();

    // Blocks are ordered by rank + nesting (b1, b2, then b3 under b2), not input order.
    expect(lastEditorContent?.blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
    expect(lastEditorContent?.blockCount).toBe(3);

    // The outline is built from the heading block.
    const handle = getHandle()!;
    expect(handle.pageOutline.length).toBe(1);
    expect(handle.pageOutline[0].text).toBe("Heading");
    expect(handle.displayBlocks.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);

    await act(async () => { root.unmount(); });
  });

  it("shows the skeleton while the page is loading", async () => {
    mockPageData = { page: null, blocks: [], isLoading: true };
    const { container, root } = await renderShell();
    expect(container.querySelector("[data-testid=skeleton]")).not.toBeNull();
    expect(container.querySelector("[data-testid=editor-content]")).toBeNull();
    await act(async () => { root.unmount(); });
  });
});
