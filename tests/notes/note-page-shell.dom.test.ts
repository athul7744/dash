/// <reference types="vitest/globals" />

import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { NotePageShellHandle } from "@/components/notes/page/NotePageShell";
import type { NoteBlockRow, NotePageRow } from "@/hooks/use-notes";
import { createNoteDocumentFromText, serializeNoteDocument } from "@/lib/notes/notes-content";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Mock state containers ───────────────────────────────────────────────────

let mockPageData: { page: NotePageRow | null; blocks: NoteBlockRow[]; isLoading: boolean } = {
  page: null,
  blocks: [],
  isLoading: true,
};

let mockAttachmentsData: { attachments: never[]; isLoading: boolean } = {
  attachments: [],
  isLoading: false,
};

let mockLinkedRefsData: { references: never[]; isLoading: boolean } = {
  references: [],
  isLoading: false,
};

let mockTagMentionsData: { tags: never[]; isLoading: boolean } = {
  tags: [],
  isLoading: false,
};

let mockPropertyDefsData: { definitions: never[]; isLoading: boolean } = {
  definitions: [],
  isLoading: false,
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/hooks/use-notes", () => ({
  useNotePageWithBlocks: () => mockPageData,
  usePageAttachments: () => mockAttachmentsData,
  useLinkedNoteReferences: () => mockLinkedRefsData,
  usePageTagMentions: () => mockTagMentionsData,
}));

vi.mock("@powersync/react", () => ({
  useQuery: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-property-definitions", () => ({
  usePropertyDefinitions: () => mockPropertyDefsData,
}));

vi.mock("@/hooks/use-settled-timestamp", () => ({
  useSettledTimestamp: () => ({
    stableUpdatedTimestamp: null,
    showAbsoluteUpdatedTime: false,
    revealAbsoluteUpdatedTime: () => {},
    resetTimestamp: () => {},
  }),
}));

vi.mock("@/lib/notes/notes", () => ({
  createNoteBlock: vi.fn(),
  deleteNoteBlock: vi.fn(async () => undefined),
  moveNoteBlock: vi.fn(),
  queueNoteBlockCreate: vi.fn(),
  queueNoteBlockCreates: vi.fn(),
  updateNoteBlock: vi.fn(),
  deletePage: vi.fn(async () => undefined),
  updatePageProperties: vi.fn(),
  updatePageTitle: vi.fn(),
  normalizeNotePageTitle: (t: string) => t.trim(),
}));

vi.mock("@/lib/shared/debounced-update", () => ({
  flushUpdate: vi.fn(async () => undefined),
  scheduleDebouncedUpdate: vi.fn(),
  hasPendingWrites: () => false,
}));

vi.mock("@/lib/powersync/db", () => ({
  db: { execute: vi.fn(async () => undefined) },
}));

vi.mock("@/lib/shared/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/notes/notes-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notes/notes-content")>();
  return actual;
});

// Mock the NotesEditorContent to avoid rendering complex tree
vi.mock("@/components/notes/page/NotesEditorContent", () => ({
  NotesEditorContent: ({ editorContent }: { editorContent: unknown }) => {
    return React.createElement("div", { "data-testid": "editor-content" }, JSON.stringify(editorContent));
  },
}));

vi.mock("@/components/notes/NotesPageSkeleton", () => ({
  NotesEditorMainSkeleton: () => React.createElement("div", { "data-testid": "skeleton" }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createPage(id: string, title: string): NotePageRow {
  return {
    id,
    user_id: "user-1",
    title,
    properties: "{}",
    created_at: "2026-05-14T00:00:00.000Z",
    updated_at: "2026-05-14T00:00:00.000Z",
  };
}

function createBlock(id: string, text: string): NoteBlockRow {
  return {
    id,
    user_id: "user-1",
    page_id: "page-1",
    parent_block_id: null,
    type: "text",
    content: serializeNoteDocument(createNoteDocumentFromText(text)),
    sort_rank: "0|hzzzzz:",
    updated_at: "2026-05-14T00:00:00.000Z",
  };
}

async function renderShell(props?: Partial<React.ComponentProps<typeof NotePageShell>>) {
  const { NotePageShell } = await import("@/components/notes/page/NotePageShell");
  const ref = createRef<NotePageShellHandle>();
  const container = document.createElement("div");
  let root: Root | null = null;

  const defaultProps = {
    pageId: "page-1",
    notePageTitles: [],
    notePageIdByTitle: new Map<string, string>(),
    onNavigateToPage: vi.fn(),
    onDeleteSuccess: vi.fn(),
    ...props,
  };

  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(NotePageShell, { ref, ...defaultProps }));
  });

  return { ref, container, root: root!, rerender: async (nextProps: Partial<typeof defaultProps>) => {
    await act(async () => {
      root!.render(React.createElement(NotePageShell, { ref, ...defaultProps, ...nextProps }));
    });
  }};
}

// Lazy import after mocks are set up
let NotePageShell: typeof import("@/components/notes/page/NotePageShell").NotePageShell;

beforeAll(async () => {
  const mod = await import("@/components/notes/page/NotePageShell");
  NotePageShell = mod.NotePageShell;
});

afterEach(async () => {
  // Dispose store to avoid stale state between tests
  const { disposeNoteBlockStore } = await import("@/lib/notes/note-block-store");
  disposeNoteBlockStore("page-1");

  mockPageData = { page: null, blocks: [], isLoading: true };
  mockAttachmentsData = { attachments: [], isLoading: false };
  mockLinkedRefsData = { references: [], isLoading: false };
  mockTagMentionsData = { tags: [], isLoading: false };
  mockPropertyDefsData = { definitions: [], isLoading: false };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("NotePageShell", () => {
  it("renders skeleton while page data is loading", async () => {
    mockPageData = { page: null, blocks: [], isLoading: true };

    const { container } = await renderShell();

    expect(container.querySelector("[data-testid='skeleton']")).not.toBeNull();
    expect(container.querySelector("[data-testid='editor-content']")).toBeNull();
  });

  it("renders editor content once page data is loaded", async () => {
    mockPageData = {
      page: createPage("page-1", "Test Page"),
      blocks: [createBlock("block-1", "Hello world")],
      isLoading: false,
    };

    const { container } = await renderShell();

    expect(container.querySelector("[data-testid='skeleton']")).toBeNull();
    expect(container.querySelector("[data-testid='editor-content']")).not.toBeNull();
  });

  it("exposes isReady=false via handle while loading", async () => {
    mockPageData = { page: null, blocks: [], isLoading: true };

    const { ref } = await renderShell();

    expect(ref.current?.isReady).toBe(false);
  });

  it("exposes isReady=true via handle once loaded", async () => {
    mockPageData = {
      page: createPage("page-1", "Test Page"),
      blocks: [createBlock("block-1", "Content")],
      isLoading: false,
    };

    const { ref } = await renderShell();

    expect(ref.current?.isReady).toBe(true);
  });

  it("renders skeleton when property definitions are still loading", async () => {
    mockPageData = {
      page: createPage("page-1", "Test Page"),
      blocks: [createBlock("block-1", "Content")],
      isLoading: false,
    };
    mockPropertyDefsData = { definitions: [], isLoading: true };

    const { container } = await renderShell();

    expect(container.querySelector("[data-testid='skeleton']")).not.toBeNull();
    expect(container.querySelector("[data-testid='editor-content']")).toBeNull();
  });

  it("shows skeleton when page id does not match loaded page", async () => {
    mockPageData = {
      page: createPage("page-2", "Wrong Page"),
      blocks: [],
      isLoading: false,
    };

    const { container } = await renderShell({ pageId: "page-1" });

    expect(container.querySelector("[data-testid='skeleton']")).not.toBeNull();
  });

  it("includes backlink count in editor content", async () => {
    mockPageData = {
      page: createPage("page-1", "Test"),
      blocks: [createBlock("b1", "text")],
      isLoading: false,
    };
    mockLinkedRefsData = {
      references: [
        { source_block_id: "x", source_page_id: "p2", source_page_title: "Other", source_block_content: "{}", source_block_updated_at: null, source_page_properties: null },
        { source_block_id: "y", source_page_id: "p3", source_page_title: "Another", source_block_content: "{}", source_block_updated_at: null, source_page_properties: null },
      ] as never[],
      isLoading: false,
    };

    const { container } = await renderShell();

    const editorEl = container.querySelector("[data-testid='editor-content']");
    const content = JSON.parse(editorEl!.textContent!);
    expect(content.backlinkCount).toBe(2);
  });

  it("exposes linkedReferences through handle for details rail", async () => {
    const refs = [
      { source_block_id: "x", source_page_id: "p2", source_page_title: "Other", source_block_content: "{}", source_block_updated_at: null, source_page_properties: null },
    ];
    mockPageData = {
      page: createPage("page-1", "Test"),
      blocks: [createBlock("b1", "text")],
      isLoading: false,
    };
    mockLinkedRefsData = { references: refs as never[], isLoading: false };

    const { ref } = await renderShell();

    expect(ref.current?.linkedReferences).toHaveLength(1);
  });

  it("reflects updated blocks in editor content when data changes", async () => {
    mockPageData = {
      page: createPage("page-1", "Test Page"),
      blocks: [createBlock("a", "Before")],
      isLoading: false,
    };

    const { container, rerender } = await renderShell();

    // Verify initial render
    const editorEl = container.querySelector("[data-testid='editor-content']");
    expect(editorEl).not.toBeNull();
    const initialContent = JSON.parse(editorEl!.textContent!);
    expect(initialContent.blocks).toHaveLength(1);

    // Update blocks
    mockPageData = {
      page: createPage("page-1", "Test Page"),
      blocks: [createBlock("a", "After")],
      isLoading: false,
    };

    await rerender({});

    const updatedEl = container.querySelector("[data-testid='editor-content']");
    const updatedContent = JSON.parse(updatedEl!.textContent!);
    expect(updatedContent.blocks[0]?.content).toBe(serializeNoteDocument(createNoteDocumentFromText("After")));
  });

  it("exposes displayBlocks via handle reflecting current block state", async () => {
    mockPageData = {
      page: createPage("page-1", "Test"),
      blocks: [
        createBlock("a", "First"),
        createBlock("b", "Second"),
      ],
      isLoading: false,
    };

    const { ref } = await renderShell();

    expect(ref.current?.displayBlocks).toHaveLength(2);
    expect(ref.current?.displayBlocks[0]?.id).toBe("a");
    expect(ref.current?.displayBlocks[1]?.id).toBe("b");
  });
});
