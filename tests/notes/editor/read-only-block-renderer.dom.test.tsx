/// <reference types="vitest/globals" />

/**
 * Smoke test for the read-only renderer (Phase 7a): it assembles flat block rows
 * into one document and renders them through the single-doc schema in a
 * non-editable editor. Verifies text, headings, and task checkboxes render.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { serializeNoteDocument } from "@/lib/notes/notes-content";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(async () => undefined), writeTransaction: vi.fn() } }));
vi.mock("@powersync/react", () => ({ useQuery: () => ({ data: [], isLoading: false }) }));

function content(nodes: unknown[]): string {
  return serializeNoteDocument({ type: "doc", content: nodes });
}

async function render(blocks: Array<{ id: string; parent_block_id: string | null; sort_rank: string; type: string; content: string }>) {
  const { ReadOnlyBlockRenderer } = await import("@/components/notes/ReadOnlyBlockRenderer");
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(ReadOnlyBlockRenderer, { blocks }));
  });
  // Let the useEditor effect create + mount the ProseMirror view.
  await act(async () => { await Promise.resolve(); });
  return { container, root: root! };
}

describe("ReadOnlyBlockRenderer", () => {
  it("renders heading, paragraph, and task blocks read-only", async () => {
    const { container, root } = await render([
      { id: "b1", parent_block_id: null, sort_rank: "a0", type: "text", content: content([{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] }]) },
      { id: "b2", parent_block_id: null, sort_rank: "a1", type: "text", content: content([{ type: "paragraph", content: [{ type: "text", text: "Body text" }] }]) },
      { id: "b3", parent_block_id: null, sort_rank: "a2", type: "task", content: content([{ type: "taskLine", attrs: { checked: true }, content: [{ type: "text", text: "Done item" }] }]) },
    ]);

    expect(container.textContent).toContain("Title");
    expect(container.textContent).toContain("Body text");
    expect(container.textContent).toContain("Done item");
    // The editor is non-editable and rendered the task checkbox chrome.
    expect(container.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("false");
    expect(container.querySelector(".note-task-checkbox")).not.toBeNull();

    await act(async () => { root.unmount(); });
  });
});
