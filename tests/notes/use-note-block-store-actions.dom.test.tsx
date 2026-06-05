/// <reference types="vitest/globals" />

import React, { act, createRef, forwardRef, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { NoteBlockRow } from "@/hooks/use-notes";
import { useNoteBlockStoreActions } from "@/components/notes/page/useNoteBlockStoreActions";
import { createNoteDocumentFromText, serializeNoteDocument } from "@/lib/notes/notes-content";
import { disposeNoteBlockStore, type JsonValue, type NoteBlockStore } from "@/lib/notes/note-block-store";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/powersync/db", () => ({
  db: {
    execute: vi.fn(async () => undefined),
    getAll: vi.fn(async () => []),
    writeTransaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ execute: vi.fn(async () => undefined), getAll: vi.fn(async () => []) });
    }),
  },
}));

vi.mock("@/lib/shared/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/notes/notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notes/notes")>();
  return {
    ...actual,
    reconcileNoteBlockEdges: vi.fn(async () => undefined),
  };
});

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

type HarnessHandle = {
  store: NoteBlockStore;
  updateContent: (blockId: string, nextContent: JsonValue) => void;
};

const HookHarness = forwardRef<HarnessHandle, { blocks: NoteBlockRow[] }>(({ blocks }, ref) => {
  const actions = useNoteBlockStoreActions({ pageId: "page-1", selectedBlocks: blocks });

  useImperativeHandle(ref, () => ({
    store: actions.store,
    updateContent: actions.handleUpdateBlockContent,
  }), [actions.store, actions.handleUpdateBlockContent]);

  return null;
});

HookHarness.displayName = "HookHarness";

async function renderHarness(blocks: NoteBlockRow[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<HarnessHandle>();

  await act(async () => {
    root.render(React.createElement(HookHarness, { ref, blocks }));
    await Promise.resolve();
  });

  if (!ref.current) {
    throw new Error("Hook harness failed to mount");
  }

  const handle = ref.current;

  return {
    handle,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      disposeNoteBlockStore("page-1");
    },
  };
}

afterEach(() => {
  disposeNoteBlockStore("page-1");
});

it("does not reapply live editor content when update content matches current editor JSON", async () => {
  const nextContent = createNoteDocumentFromText("Hello brave world") as JsonValue;
  const setContent = vi.fn();
  const mounted = await renderHarness([createBlock("block-1", "Hello world")]);

  mounted.handle.store.setEditorRef("block-1", {
    getJSON: () => nextContent,
    commands: { setContent },
  } as any);

  act(() => {
    mounted.handle.updateContent("block-1", nextContent);
  });

  expect(setContent).not.toHaveBeenCalled();
  await mounted.unmount();
});

it("still reapplies programmatic content when it differs from current editor JSON", async () => {
  const currentContent = createNoteDocumentFromText("Hello world") as JsonValue;
  const nextContent = createNoteDocumentFromText("Hello blue world") as JsonValue;
  const setContent = vi.fn();
  const mounted = await renderHarness([createBlock("block-1", "Hello world")]);

  mounted.handle.store.setEditorRef("block-1", {
    getJSON: () => currentContent,
    commands: { setContent },
  } as any);

  act(() => {
    mounted.handle.updateContent("block-1", nextContent);
  });

  expect(setContent).toHaveBeenCalledWith(nextContent, { emitUpdate: false });
  await mounted.unmount();
});