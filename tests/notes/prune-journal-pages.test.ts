/// <reference types="vitest/globals" />

export {}; // ensure module scope so top-level mock consts don't collide across test files

const executeMock = vi.fn(async () => undefined);
const getAllMock = vi.fn(async (): Promise<unknown[]> => []);
const getOptionalMock = vi.fn(async () => null);

vi.mock("@/lib/powersync/db", () => ({
  db: {
    execute: executeMock,
    getAll: getAllMock,
    getOptional: getOptionalMock,
  },
}));

vi.mock("@/lib/shared/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

// Real extractNoteText runs against these — a blank paragraph doc extracts to "".
const BLANK_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
const TEXT_DOC = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "kept" }] }],
});

type Row = { page_id: string; block_count: number; first_content: string | null };

/** page ids passed to the final `DELETE FROM pages WHERE id = ?` in deleteNotePage. */
function deletedPageIds(): string[] {
  return (executeMock.mock.calls as unknown[][])
    .filter((call) => String(call[0] ?? "").includes("DELETE FROM pages WHERE id"))
    .map((call) => (call[1] as string[])[0]);
}

async function prune(rows: Row[], exceptPageId?: string | null) {
  getAllMock.mockResolvedValue(rows);
  const { pruneEmptyJournalPages } = await import("@/lib/notes/notes");
  await pruneEmptyJournalPages(exceptPageId);
}

describe("pruneEmptyJournalPages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    executeMock.mockResolvedValue(undefined);
    getAllMock.mockResolvedValue([]);
  });

  it("deletes a journal page that is a single blank block", async () => {
    await prune([{ page_id: "p-blank", block_count: 1, first_content: BLANK_DOC }]);
    expect(deletedPageIds()).toContain("p-blank");
  });

  it("deletes a journal page with zero blocks", async () => {
    await prune([{ page_id: "p-zero", block_count: 0, first_content: null }]);
    expect(deletedPageIds()).toContain("p-zero");
  });

  it("keeps a journal page that has typed text", async () => {
    await prune([{ page_id: "p-text", block_count: 1, first_content: TEXT_DOC }]);
    expect(deletedPageIds()).not.toContain("p-text");
  });

  it("keeps a journal page with more than one block", async () => {
    await prune([{ page_id: "p-multi", block_count: 2, first_content: BLANK_DOC }]);
    expect(deletedPageIds()).not.toContain("p-multi");
  });

  it("never deletes the excepted (currently open) page even when empty", async () => {
    await prune([{ page_id: "p-current", block_count: 1, first_content: BLANK_DOC }], "p-current");
    expect(deletedPageIds()).not.toContain("p-current");
  });

  it("prunes only the empty pages in a mixed set", async () => {
    await prune([
      { page_id: "p-blank", block_count: 1, first_content: BLANK_DOC },
      { page_id: "p-text", block_count: 1, first_content: TEXT_DOC },
      { page_id: "p-zero", block_count: 0, first_content: null },
    ]);
    const deleted = deletedPageIds();
    expect(deleted).toContain("p-blank");
    expect(deleted).toContain("p-zero");
    expect(deleted).not.toContain("p-text");
  });
});
