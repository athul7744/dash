/// <reference types="vitest/globals" />

import React, { act, forwardRef, useImperativeHandle, useSyncExternalStore, useCallback, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";

import { NotesBlockTree } from "@/components/notes/NotesBlockTree";
import type { NoteBlockRow } from "@/hooks/use-notes";
import { createNoteDocumentFromText, serializeNoteDocument } from "@/lib/notes/notes-content";
import { NoteBlockStore, type BlockRow, type BlockNode } from "@/lib/notes/note-block-store";
import {
  getDeleteChildMoves,
  getDeleteFocusTarget,
  getIndentPosition,
  getBlockRangeMovePlan,
  getOutdentPosition,
  getMergeChildMoves,
  getMergePlan,
} from "@/lib/notes/block-editor-structure";
import { mergeNoteDocuments, getNoteDocumentEndSelection } from "@/lib/notes/notes-content";
import { getVisibleNoteBlockIds } from "@/lib/notes/notes-tree";
import { getRankAfterItem } from "@/lib/shared/ranked-order";

vi.mock("@/lib/powersync/db", () => ({
  db: { execute: vi.fn(async () => undefined) },
}));

vi.mock("@/lib/shared/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const emptyDomRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

if (!HTMLElement.prototype.getBoundingClientRect) {
  HTMLElement.prototype.getBoundingClientRect = () => emptyDomRect as DOMRect;
}

if (!HTMLElement.prototype.getClientRects) {
  HTMLElement.prototype.getClientRects = () => ({
    item: () => null,
    length: 0,
    [Symbol.iterator]: function* iterator() {
      yield emptyDomRect as DOMRect;
    },
  }) as DOMRectList;
}

if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => emptyDomRect as DOMRect;
}

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({
    item: () => null,
    length: 0,
    [Symbol.iterator]: function* iterator() {
      yield emptyDomRect as DOMRect;
    },
  }) as DOMRectList;
}

type FocusTarget = { blockId: string; placement: number | "start" | "end" } | null;

function createBlock(id: string, parentBlockId: string | null, sortRank: string, text: string): NoteBlockRow {
  return {
    id,
    user_id: "user-1",
    page_id: "page-1",
    parent_block_id: parentBlockId,
    type: "text",
    content: serializeNoteDocument(createNoteDocumentFromText(text)),
    sort_rank: sortRank,
    updated_at: "2026-05-14T00:00:00.000Z",
  };
}

function createBlockWithContent(id: string, parentBlockId: string | null, sortRank: string, content: unknown): NoteBlockRow {
  return {
    id,
    user_id: "user-1",
    page_id: "page-1",
    parent_block_id: parentBlockId,
    type: "text",
    content: serializeNoteDocument(content),
    sort_rank: sortRank,
    updated_at: "2026-05-14T00:00:00.000Z",
  };
}

function createTableDocument() {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }] },
            ],
          },
        ],
      },
    ],
  };
}

function toBlockRows(blocks: NoteBlockRow[]): BlockRow[] {
  return blocks.map((b) => ({
    id: b.id,
    page_id: b.page_id ?? "page-1",
    parent_block_id: b.parent_block_id ?? null,
    sort_rank: b.sort_rank ?? "",
    type: b.type ?? "text",
    content: b.content ?? "{}",
  }));
}

async function waitForEditors(container: HTMLElement) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const editorElements = container.querySelectorAll(".ProseMirror");
    if (editorElements.length >= 2) {
      return Array.from(editorElements) as HTMLElement[];
    }

    await act(async () => {
      await Promise.resolve();
    });
  }

  throw new Error("Editors failed to initialize");
}

async function waitForEditorCount(container: HTMLElement, count: number) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const editorElements = container.querySelectorAll(".ProseMirror");
    if (editorElements.length === count) {
      return Array.from(editorElements) as HTMLElement[];
    }

    await act(async () => {
      await Promise.resolve();
    });
  }

  throw new Error(`Expected ${count} editors`);
}

function dispatchEditorKey(target: HTMLElement, key: string, options?: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });

  target.dispatchEvent(event);
  return event;
}

function dispatchMouseClick(target: HTMLElement) {
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
}

function dispatchPointerMouseClick(target: HTMLElement) {
  target.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
  dispatchMouseClick(target);
}

// ─── TreeHarness (backed by NoteBlockStore) ──────────────────────────────────

type TreeHarnessHandle = {
  snapshot: () => {
    orderedBlockIds: string[];
    focusTarget: FocusTarget;
  };
};

const TreeHarness = forwardRef<TreeHarnessHandle, {
  blocks: NoteBlockRow[];
  initialFocusTarget: FocusTarget;
}>(({ blocks, initialFocusTarget }, ref) => {
  const [store] = React.useState(() => {
    const s = new NoteBlockStore("page-1", { debounceMs: 60000 }); // very long debounce so nothing flushes during test
    s.hydrate(toBlockRows(blocks));
    return s;
  });

  const [focusTarget, setFocusTarget] = React.useState<FocusTarget>(initialFocusTarget);

  // Subscribe to store
  const subscribe = useCallback((fn: () => void) => store.subscribe(fn), [store]);
  const getSnapshot = useCallback(() => store.version, [store]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const structuredItems = useMemo(() => {
    return store.getOrderedBlocks().map((n) => ({
      id: n.id,
      parent_block_id: n.parentId,
      sort_rank: n.sortRank,
    }));
  }, [store.version]);

  const orderedVisibleBlockIds = useMemo(
    () => getVisibleNoteBlockIds(structuredItems),
    [structuredItems],
  );

  const displayBlocks: NoteBlockRow[] = useMemo(() => {
    return store.getOrderedBlocks().map((node) => ({
      id: node.id,
      user_id: "user-1",
      page_id: "page-1",
      parent_block_id: node.parentId,
      type: node.type,
      content: store.getContent(node.id),
      sort_rank: node.sortRank,
      updated_at: null,
    })) as NoteBlockRow[];
  }, [store.version]);

  useImperativeHandle(ref, () => ({
    snapshot: () => ({
      orderedBlockIds: orderedVisibleBlockIds,
      focusTarget,
    }),
  }), [orderedVisibleBlockIds, focusTarget]);

  // ─── Block action callbacks ────────────────────────────────────────────

  const handleDeleteBlock = (blockId: string) => {
    const childMoves = getDeleteChildMoves(structuredItems, blockId);
    for (const move of childMoves) {
      store.moveBlockSilent(move.blockId, move.parentBlockId, move.sortRank);
    }
    const nextFocusTarget = getDeleteFocusTarget(orderedVisibleBlockIds, blockId);
    store.deleteBlock(blockId);
    setFocusTarget(nextFocusTarget);
  };

  const handleMoveSelectedBlockRange = (blockIds: string[], direction: "up" | "down", focusBlockId: string) => {
    const moves = getBlockRangeMovePlan(structuredItems, blockIds, direction);
    if (moves.length === 0) return;
    store.moveBlockRange(moves.map((m) => ({
      blockId: m.blockId,
      newParentId: m.parentBlockId,
      newSortRank: m.sortRank,
    })));
    setFocusTarget({ blockId: focusBlockId, placement: "start" });
  };

  const handleMergeWithPrevious = (blockId: string, previousBlockId: string, nextContent: unknown, options?: { hasChildren?: boolean }) => {
    const prevBlockContent = store.getContent(previousBlockId);
    const mergedContent = mergeNoteDocuments(prevBlockContent, nextContent);
    const joinPlacement = getNoteDocumentEndSelection(prevBlockContent);
    const mergePlan = getMergePlan(blockId, previousBlockId, joinPlacement);
    const childMoves = options?.hasChildren
      ? getMergeChildMoves(structuredItems, blockId, mergePlan.updatedBlockId)
      : [];
    for (const move of childMoves) {
      store.moveBlockSilent(move.blockId, move.parentBlockId, move.sortRank);
    }
    store.mergeBlocks({ targetBlockId: previousBlockId, deletedBlockId: mergePlan.deletedBlockId, mergedContent: mergedContent as any });
    setFocusTarget(mergePlan.focusTarget);
  };

  const handleIndentBlock = (blockId: string, nextParentBlockId: string) => {
    const nextPosition = getIndentPosition(structuredItems, blockId, nextParentBlockId);
    store.moveBlock(blockId, nextPosition.parentBlockId, nextPosition.sortRank);
    setFocusTarget({ blockId, placement: "start" });
  };

  const handleOutdentBlock = (blockId: string, nextParentBlockId?: string | null) => {
    const nextPosition = getOutdentPosition(structuredItems, blockId, nextParentBlockId);
    store.moveBlock(blockId, nextPosition.parentBlockId, nextPosition.sortRank);
    setFocusTarget({ blockId, placement: "start" });
  };

  const handleCreateSibling = (blockId: string, parentBlockId: string | null | undefined, nextContent: unknown, nextSiblingContent?: unknown) => {
    const parentId = parentBlockId ?? null;
    const nextSortRank = getRankAfterItem(structuredItems, blockId, parentId, (b) => b.parent_block_id);
    const sourceNode = store.getBlock(blockId);
    if (sourceNode?.editorRef) {
      sourceNode.editorRef.commands.setContent(nextContent as any, { emitUpdate: false });
      store.commitContent(blockId);
    }
    const newBlockId = store.splitBlock({
      sourceBlockId: blockId,
      leftContent: nextContent as any,
      rightContent: (nextSiblingContent ?? { type: "doc", content: [{ type: "paragraph" }] }) as any,
      newSortRank: nextSortRank,
      newParentId: parentId,
    });
    setFocusTarget({ blockId: newBlockId, placement: "end" });
  };

  const handleCreateEmptySibling = (blockId: string, parentBlockId: string | null | undefined) => {
    const parentId = parentBlockId ?? null;
    const nextSortRank = getRankAfterItem(structuredItems, blockId, parentId, (b) => b.parent_block_id);
    const newBlockId = store.createBlock({ parentId, sortRank: nextSortRank });
    setFocusTarget({ blockId: newBlockId, placement: "end" });
  };

  const handleCommitContent = (blockId: string) => {
    store.commitContent(blockId);
  };

  return React.createElement(NotesBlockTree, {
    blocks: displayBlocks,
    focusedBlockId: focusTarget?.blockId ?? null,
    focusPlacement: focusTarget?.placement ?? undefined,
    onCreateFirstBlock: () => undefined,
    onFocusApplied: () => setFocusTarget(null),
    onFocusBlock: (blockId: string, placement: "start" | "end") => setFocusTarget({ blockId, placement }),
    notePageTitles: [],
    onCreateSibling: handleCreateSibling,
    onCreateEmptySibling: handleCreateEmptySibling,
    onCreateSiblings: vi.fn(),
    onMergeWithPrevious: handleMergeWithPrevious,
    onCommitContent: handleCommitContent,
    onIndent: handleIndentBlock,
    onOutdent: handleOutdentBlock,
    onMoveSelectedBlockRange: handleMoveSelectedBlockRange,
    onDelete: handleDeleteBlock,
    onDeleteRange: (ids: string[]) => ids.forEach(handleDeleteBlock),
    onUpdateContent: vi.fn(),
  });
});

TreeHarness.displayName = "TreeHarness";

// ─── Pure component tests ────────────────────────────────────────────────────

it("forwards structured paste handlers to nested child editors", async () => {
  const onCreateSiblings = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(NotesBlockTree, {
        blocks: [
          createBlock("parent", null, "0|hzzzzz:", "Parent"),
          createBlock("child", "parent", "0|i00007:", "Child"),
        ],
        onCreateFirstBlock: vi.fn(),
        onFocusBlock: vi.fn(),
        notePageTitles: [],
        onCreateSibling: vi.fn(),
        onCreateEmptySibling: vi.fn(),
        onCreateSiblings,
        onMergeWithPrevious: vi.fn(),
        onCommitContent: vi.fn(),
        onIndent: vi.fn(),
        onOutdent: vi.fn(),
        onMoveSelectedBlockRange: vi.fn(),
        onDelete: vi.fn(),
        onDeleteRange: vi.fn(),
        onUpdateContent: vi.fn(),
      }),
    );
  });

  const [, childEditor] = await waitForEditors(container);
  const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
    clipboardData: { getData: (type: string) => string };
  };

  Object.defineProperty(pasteEvent, "clipboardData", {
    value: {
      getData(type: string) {
        if (type === "text/plain") {
          return [
            "- first",
            "  - nested",
            "- second",
          ].join("\n");
        }

        return "";
      },
    },
  });

  await act(async () => {
    childEditor.dispatchEvent(pasteEvent);
  });

  expect(onCreateSiblings).toHaveBeenCalledTimes(1);
  expect(onCreateSiblings).toHaveBeenCalledWith(
    "child",
    "parent",
    expect.objectContaining({ children: [expect.any(Object)] }),
    expect.any(Array),
  );

  await act(async () => {
    root?.unmount();
  });
  container.remove();
});

// ─── Store-backed integration tests ─────────────────────────────────────────

it("deletes an empty block through the Backspace editor flow and updates tree state", async () => {
  const ref = React.createRef<TreeHarnessHandle>();
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(TreeHarness, {
        ref,
        blocks: [
          createBlock("first", null, "0|hzzzzz:", "First"),
          createBlock("current", null, "0|i00007:", ""),
        ],
        initialFocusTarget: { blockId: "current", placement: "start" },
      }),
    );
  });

  const [, emptyEditor] = await waitForEditors(container);

  await act(async () => {
    dispatchEditorKey(emptyEditor, "Backspace");
    await Promise.resolve();
  });

  await waitForEditorCount(container, 1);

  expect(ref.current?.snapshot().orderedBlockIds).toEqual(["first"]);
  expect(ref.current?.snapshot().focusTarget).toEqual({ blockId: "first", placement: "end" });

  await act(async () => {
    root?.unmount();
  });
  container.remove();
});

it("moves a focused unselected block with Alt+ArrowDown", async () => {
  const ref = React.createRef<TreeHarnessHandle>();
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(TreeHarness, {
        ref,
        blocks: [
          createBlock("first", null, "0|hzzzzz:", "First"),
          createBlock("second", null, "0|i00007:", "Second"),
          createBlock("third", null, "0|i0000f:", "Third"),
        ],
        initialFocusTarget: null,
      }),
    );
  });

  const [, focusedEditor] = await waitForEditors(container);

  await act(async () => {
    dispatchEditorKey(focusedEditor, "ArrowDown", { altKey: true });
    await Promise.resolve();
  });

  expect(ref.current?.snapshot().orderedBlockIds).toEqual(["first", "third", "second"]);
  expect(ref.current?.snapshot().focusTarget).toEqual({ blockId: "second", placement: "start" });

  await act(async () => {
    root?.unmount();
  });
  container.remove();
});

it("preserves shift selection across focus moves and moves the selected range with Alt+ArrowDown", async () => {
  const ref = React.createRef<TreeHarnessHandle>();
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(TreeHarness, {
        ref,
        blocks: [
          createBlock("first", null, "0|hzzzzz:", "First"),
          createBlock("second", null, "0|i00007:", "Second"),
          createBlock("third", null, "0|i0000f:", "Third"),
          createBlock("fourth", null, "0|i0000n:", "Fourth"),
        ],
        initialFocusTarget: { blockId: "second", placement: "start" },
      }),
    );
  });

  const [, secondEditor, thirdEditor] = await waitForEditors(container);

  await act(async () => {
    dispatchEditorKey(secondEditor, "ArrowDown", { shiftKey: true });
    await Promise.resolve();
  });

  const selectedBlocksAfterShift = Array.from(container.querySelectorAll('[class*="bg-accent/45"]'));
  expect(selectedBlocksAfterShift).toHaveLength(2);

  await act(async () => {
    dispatchEditorKey(thirdEditor, "ArrowDown", { altKey: true });
    await Promise.resolve();
  });

  expect(ref.current?.snapshot().orderedBlockIds).toEqual(["first", "fourth", "second", "third"]);

  await act(async () => {
    root?.unmount();
  });
  container.remove();
});

it("shows block context menu move actions and routes them through the block move handler", async () => {
  const onMoveSelectedBlockRange = vi.fn();
  const onDelete = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(NotesBlockTree, {
        blocks: [
          createBlock("first", null, "0|hzzzzz:", "First"),
          createBlock("second", null, "0|i00007:", "Second"),
          createBlock("third", null, "0|i0000f:", "Third"),
        ],
        onCreateFirstBlock: vi.fn(),
        onFocusBlock: vi.fn(),
        notePageTitles: [],
        onCreateSibling: vi.fn(),
        onCreateEmptySibling: vi.fn(),
        onCreateSiblings: vi.fn(),
        onMergeWithPrevious: vi.fn(),
        onCommitContent: vi.fn(),
        onIndent: vi.fn(),
        onOutdent: vi.fn(),
        onMoveSelectedBlockRange,
        onDelete,
        onDeleteRange: vi.fn(),
        onUpdateContent: vi.fn(),
      }),
    );
  });

  const bulletButtons = Array.from(container.querySelectorAll('button[aria-label="Toggle raw markdown view"]')) as HTMLButtonElement[];

  await act(async () => {
    bulletButtons[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });

  const moveUpButton = container.querySelector('button[aria-label="Move block up"]') as HTMLButtonElement | null;
  const moveDownButton = container.querySelector('button[aria-label="Move block down"]') as HTMLButtonElement | null;

  expect(moveUpButton).not.toBeNull();
  expect(moveDownButton).not.toBeNull();

  await act(async () => {
    if (moveUpButton) {
      dispatchMouseClick(moveUpButton);
    }
  });

  expect(onMoveSelectedBlockRange).toHaveBeenNthCalledWith(1, ["second"], "up", "second");

  await act(async () => {
    bulletButtons[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });

  const reopenedMoveDownButton = container.querySelector('button[aria-label="Move block down"]') as HTMLButtonElement | null;

  await act(async () => {
    if (reopenedMoveDownButton) {
      dispatchMouseClick(reopenedMoveDownButton);
    }
  });

  expect(onMoveSelectedBlockRange).toHaveBeenNthCalledWith(2, ["second"], "down", "second");
  expect(onDelete).not.toHaveBeenCalled();

  await act(async () => {
    root?.unmount();
  });
  container.remove();
});

it("applies block color from the context menu color palette", async () => {
  const onUpdateContent = vi.fn();
  const onCommitContent = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(NotesBlockTree, {
        blocks: [createBlock("first", null, "0|hzzzzz:", "First")],
        onCreateFirstBlock: vi.fn(),
        onFocusBlock: vi.fn(),
        notePageTitles: [],
        onCreateSibling: vi.fn(),
        onCreateEmptySibling: vi.fn(),
        onCreateSiblings: vi.fn(),
        onMergeWithPrevious: vi.fn(),
        onCommitContent,
        onIndent: vi.fn(),
        onOutdent: vi.fn(),
        onMoveSelectedBlockRange: vi.fn(),
        onDelete: vi.fn(),
        onDeleteRange: vi.fn(),
        onUpdateContent,
      }),
    );
  });

  const bulletButton = container.querySelector('button[aria-label="Toggle raw markdown view"]') as HTMLButtonElement | null;

  await act(async () => {
    bulletButton?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });

  const blockColorButton = container.querySelector('button[aria-label="Block color"]') as HTMLButtonElement | null;
  expect(blockColorButton).not.toBeNull();

  await act(async () => {
    if (blockColorButton) {
      dispatchMouseClick(blockColorButton);
    }
  });

  const blueButton = container.querySelector('button[aria-label="Blue"]') as HTMLButtonElement | null;
  expect(blueButton).not.toBeNull();

  await act(async () => {
    if (blueButton) {
      dispatchPointerMouseClick(blueButton);
    }
  });

  expect(onUpdateContent).toHaveBeenCalledWith("first", {
    type: "doc",
    content: [{ type: "paragraph", attrs: { color: "blue" }, content: [{ type: "text", text: "First" }] }],
  });
  expect(onCommitContent).toHaveBeenCalledWith("first", {
    type: "doc",
    content: [{ type: "paragraph", attrs: { color: "blue" }, content: [{ type: "text", text: "First" }] }],
  });

  await act(async () => {
    root?.unmount();
  });
  container.remove();
});

it("shows heading conversions for paragraph blocks but not table blocks", async () => {
  const onConvertBlockType = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(NotesBlockTree, {
        blocks: [
          createBlock("paragraph", null, "0|hzzzzz:", "First"),
          createBlockWithContent("table", null, "0|i00007:", createTableDocument()),
        ],
        onCreateFirstBlock: vi.fn(),
        onFocusBlock: vi.fn(),
        notePageTitles: [],
        onCreateSibling: vi.fn(),
        onCreateEmptySibling: vi.fn(),
        onCreateSiblings: vi.fn(),
        onMergeWithPrevious: vi.fn(),
        onCommitContent: vi.fn(),
        onIndent: vi.fn(),
        onOutdent: vi.fn(),
        onMoveSelectedBlockRange: vi.fn(),
        onDelete: vi.fn(),
        onDeleteRange: vi.fn(),
        onUpdateContent: vi.fn(),
        onConvertBlockType,
      }),
    );
  });

  const bulletButtons = Array.from(container.querySelectorAll('button[aria-label="Toggle raw markdown view"]')) as HTMLButtonElement[];

  await act(async () => {
    bulletButtons[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });

  const headingOneButton = container.querySelector('button[aria-label="Heading 1"]') as HTMLButtonElement | null;
  expect(headingOneButton).not.toBeNull();

  await act(async () => {
    if (headingOneButton) {
      dispatchMouseClick(headingOneButton);
    }
  });

  expect(onConvertBlockType).toHaveBeenCalledTimes(1);
  expect(onConvertBlockType.mock.calls[0][0]).toBe("paragraph");
  expect(onConvertBlockType.mock.calls[0][1]).toBe("text");
  expect(onConvertBlockType.mock.calls[0][2]).toEqual({
    type: "doc",
    content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "First" }] }],
  });

  await act(async () => {
    bulletButtons[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });

  expect(container.querySelector('button[aria-label="Heading 1"]')).toBeNull();

  await act(async () => {
    root?.unmount();
  });
  container.remove();
});
