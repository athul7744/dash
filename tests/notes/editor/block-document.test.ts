/// <reference types="vitest/globals" />

import {
  assembleDoc,
  decomposeDoc,
  emptyBlockNode,
  BLOCK_NODE_TYPE,
  type BlockDocumentRow,
} from "@/lib/notes/editor/block-document";
import { normalizeNoteDocument, serializeNoteDocument } from "@/lib/notes/notes-content";

function docContent(nodes: unknown[]): string {
  return serializeNoteDocument({ type: "doc", content: nodes });
}

function row(over: Partial<BlockDocumentRow> & Pick<BlockDocumentRow, "id">): BlockDocumentRow {
  return {
    parent_block_id: null,
    sort_rank: "a0",
    type: "text",
    content: docContent([{ type: "paragraph", content: [{ type: "text", text: over.id }] }]),
    ...over,
  };
}

// A representative page: heading, paragraph with a nested child, code, math, and a query block.
const sampleRows: BlockDocumentRow[] = [
  row({ id: "b1", sort_rank: "a0", content: docContent([{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Project notes" }] }]) }),
  row({ id: "b2", sort_rank: "a1", content: docContent([{ type: "paragraph", content: [{ type: "text", text: "Ship v2" }] }]) }),
  row({ id: "b3", parent_block_id: "b2", sort_rank: "a0", content: docContent([{ type: "paragraph", content: [{ type: "text", text: "sub-point" }] }]) }),
  row({ id: "b4", sort_rank: "a2", content: docContent([{ type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const x = 1" }] }]) }),
  row({ id: "b5", sort_rank: "a3", content: docContent([{ type: "mathBlock", attrs: { latex: "E=mc^2" } }]) }),
];

describe("block-document assemble/decompose", () => {
  it("assembles flat rows into a nested block document", () => {
    const doc = assembleDoc(sampleRows);

    expect(doc.type).toBe("doc");
    // b1, b2, b4, b5 are roots; b3 nests under b2.
    const roots = doc.content ?? [];
    expect(roots.map((n) => n.attrs?.blockId)).toEqual(["b1", "b2", "b4", "b5"]);
    expect(roots.every((n) => n.type === BLOCK_NODE_TYPE)).toBe(true);

    const b2 = roots[1];
    // b2 holds its own paragraph plus the nested b3 block.
    expect(b2?.content?.[0]?.type).toBe("paragraph");
    expect(b2?.content?.[1]?.type).toBe(BLOCK_NODE_TYPE);
    expect(b2?.content?.[1]?.attrs?.blockId).toBe("b3");
  });

  it("orders siblings by sort_rank regardless of input order", () => {
    const shuffled = [sampleRows[3], sampleRows[0], sampleRows[4], sampleRows[1], sampleRows[2]];
    const doc = assembleDoc(shuffled);
    expect((doc.content ?? []).map((n) => n.attrs?.blockId)).toEqual(["b1", "b2", "b4", "b5"]);
  });

  it("round-trips: decompose(assemble(rows)) preserves ids, parents, order, type, and content", () => {
    const decomposed = decomposeDoc(assembleDoc(sampleRows));

    expect(decomposed.map((b) => b.blockId)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
    expect(decomposed.map((b) => b.parentId)).toEqual([null, null, "b2", null, null]);
    expect(decomposed.map((b) => b.type)).toEqual(["text", "text", "text", "text", "text"]);

    // b2 and b3 are each their parent's siblings at the expected index.
    const b3 = decomposed.find((b) => b.blockId === "b3")!;
    expect(b3.order).toBe(0);
    const b4 = decomposed.find((b) => b.blockId === "b4")!;
    expect(b4.order).toBe(2);

    // Content is byte-identical after the normalize→serialize round-trip.
    for (const original of sampleRows) {
      const restored = decomposed.find((b) => b.blockId === original.id)!;
      expect(restored.content).toBe(serializeNoteDocument(normalizeNoteDocument(original.content)));
    }
  });

  it("gives an empty block a default paragraph so the schema stays valid", () => {
    const doc = assembleDoc([row({ id: "b1", content: serializeNoteDocument({ type: "doc", content: [] }) })]);
    const block = doc.content?.[0];
    expect(block?.content?.[0]).toEqual({ type: "paragraph" });
  });

  it("produces a single empty block for an empty page", () => {
    const doc = assembleDoc([]);
    expect(doc.content?.length).toBe(1);
    expect(doc.content?.[0]?.type).toBe(BLOCK_NODE_TYPE);
    expect(doc.content?.[0]?.content?.[0]?.type).toBe("paragraph");
  });

  it("treats a block whose parent is missing as a root", () => {
    const doc = assembleDoc([row({ id: "orphan", parent_block_id: "gone" })]);
    expect(doc.content?.[0]?.attrs?.blockId).toBe("orphan");
  });

  it("round-trips a query block (type + queryBlock node content preserved)", () => {
    const queryContent = serializeNoteDocument({
      type: "doc",
      content: [{ type: "queryBlock", attrs: { filters: [], columns: ["status"], sort: null, limit: 20 } }],
    });
    const rows: BlockDocumentRow[] = [row({ id: "q1", type: "query", content: queryContent })];
    const decomposed = decomposeDoc(assembleDoc(rows));
    expect(decomposed).toHaveLength(1);
    expect(decomposed[0].type).toBe("query");
    expect(decomposed[0].content).toBe(queryContent);
  });

  it("migrates a legacy multi-item taskList row into one task block per item", () => {
    const taskListContent = docContent([{
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] },
        { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }] },
      ],
    }]);
    const doc = assembleDoc([row({ id: "list1", content: taskListContent })]);
    const blocks = decomposeDoc(doc);

    expect(blocks).toHaveLength(2); // one block per checkbox
    expect(blocks[0].blockId).toBe("list1"); // first keeps the row id
    expect(blocks[1].blockId).not.toBe("list1");
    for (const block of blocks) {
      expect(block.type).toBe("task");
      expect(JSON.parse(block.content).content[0].type).toBe("taskLine");
    }
    expect(JSON.parse(blocks[0].content).content[0].attrs.checked).toBe(true);
    expect(JSON.parse(blocks[1].content).content[0].attrs.checked).toBe(false);
  });

  it("migrates a nested task list into nested task blocks", () => {
    const taskListContent = docContent([{
      type: "taskList",
      content: [{
        type: "taskItem", attrs: { checked: false },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Parent" }] },
          { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Child" }] }] }] },
        ],
      }],
    }]);
    const blocks = decomposeDoc(assembleDoc([row({ id: "p", content: taskListContent })]));
    expect(blocks).toHaveLength(2);
    const parent = blocks.find((b) => b.blockId === "p")!;
    const child = blocks.find((b) => b.blockId !== "p")!;
    expect(parent.parentId).toBe(null);
    expect(child.parentId).toBe("p"); // nested task became a nested task block
    expect(child.type).toBe("task");
    expect(JSON.parse(child.content).content[0].attrs.checked).toBe(true);
  });

  it("round-trips a new task block (type task + taskLine content)", () => {
    const taskContent = docContent([{ type: "taskLine", attrs: { checked: true }, content: [{ type: "text", text: "Done" }] }]);
    const decomposed = decomposeDoc(assembleDoc([row({ id: "t1", type: "task", content: taskContent })]));
    expect(decomposed).toHaveLength(1);
    expect(decomposed[0].type).toBe("task");
    expect(JSON.parse(decomposed[0].content).content[0]).toMatchObject({ type: "taskLine", attrs: { checked: true } });
  });

  it("emptyBlockNode carries the given id and a paragraph", () => {
    const node = emptyBlockNode("new-1");
    expect(node.attrs?.blockId).toBe("new-1");
    expect(node.content?.[0]?.type).toBe("paragraph");
  });
});
