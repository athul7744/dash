"use client";

import type { JSONContent } from "@tiptap/core";

import { NoteBlockEditor } from "./NoteBlockEditor";
import { QueryBlockView } from "./QueryBlockView";

export type ReadOnlyBlockData = {
  id: string;
  type: string | null;
  content: string | null;
  children?: ReadOnlyBlockData[];
};

const NOOP = () => {};
const NOOP_JSON = (_content: JSONContent) => {};
const NOOP_UNKNOWN = (_content: unknown) => {};

const VALID_BLOCK_COLORS = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink"]);

function getBlockColorClass(content: string | null): string {
  if (!content) return "";
  try {
    const doc = JSON.parse(content);
    const firstNode = Array.isArray(doc.content) ? doc.content[0] : null;
    if (!firstNode?.attrs?.color) return "";
    if (VALID_BLOCK_COLORS.has(firstNode.attrs.color)) {
      return `block-color-${firstNode.attrs.color}`;
    }
    return "";
  } catch {
    return "";
  }
}

function ReadOnlyBlockNode({
  node,
  depth,
}: {
  node: ReadOnlyBlockData;
  depth: number;
}) {
  const colorClass = getBlockColorClass(node.content);

  if (node.type === "query") {
    return (
      <div className={`space-y-0 ${colorClass}`}>
        <div className="flex items-start gap-1 py-0.5">
          {depth > 0 && <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />}
          <div className="min-w-0 flex-1">
            <QueryBlockView
              content={node.content}
              onUpdateContent={NOOP_UNKNOWN}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-0 ${colorClass}`}>
      <div className="flex items-start gap-1 py-0">
        {depth > 0 && <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />}
        <div className="min-w-0 flex-1">
          <NoteBlockEditor
            content={node.content}
            notePageTitles={[]}
            hasChildren={(node.children?.length ?? 0) > 0}
            onChange={NOOP_JSON}
            onCreateSibling={NOOP_JSON}
            onIndent={NOOP}
            onOutdent={NOOP}
            onDeleteEmpty={NOOP}
          />
        </div>
      </div>
      {node.children && node.children.length > 0 && (
        <div className="space-y-0 border-l border-border/55 pl-2 ml-[7px]">
          {node.children.map((child) => (
            <ReadOnlyBlockNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReadOnlyBlockRenderer({ blocks }: { blocks: ReadOnlyBlockData[] }) {
  return (
    <div className="space-y-0 pointer-events-none">
      {blocks.map((block) => (
        <ReadOnlyBlockNode key={block.id} node={block} depth={0} />
      ))}
    </div>
  );
}
