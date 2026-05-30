import { ArrowDown, ArrowUp, IndentDecrease, IndentIncrease, Paintbrush, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { BlockContextMenuActionId, BlockContextMenuOption } from "@/components/notes/block-context-menu-options";
import { BLOCK_COLORS, type BlockColorKey } from "@/components/notes/NoteBlockEditorColor";

const ACTION_ICON_BY_ID: Record<BlockContextMenuActionId, typeof ArrowUp> = {
  "move-up": ArrowUp,
  "move-down": ArrowDown,
  indent: IndentIncrease,
  outdent: IndentDecrease,
  color: Paintbrush,
  delete: Trash2,
};

const COLOR_DOT_CLASSES: Record<BlockColorKey, string> = {
  gray: "bg-[oklch(0.7_0.01_250)]",
  brown: "bg-[oklch(0.55_0.08_50)]",
  orange: "bg-[oklch(0.7_0.15_55)]",
  yellow: "bg-[oklch(0.8_0.15_90)]",
  green: "bg-[oklch(0.65_0.15_150)]",
  blue: "bg-[oklch(0.6_0.15_240)]",
  purple: "bg-[oklch(0.6_0.15_300)]",
  pink: "bg-[oklch(0.65_0.15_345)]",
};

export function BlockContextMenu({
  options,
  onAction,
  onColorSelect,
}: {
  options: BlockContextMenuOption[];
  onAction: (actionId: BlockContextMenuActionId) => void;
  onColorSelect?: (color: BlockColorKey | null) => void;
}) {
  const [showColors, setShowColors] = useState(false);

  if (showColors) {
    return (
      <div
        role="menu"
        data-block-context-menu="true"
        className="absolute left-full top-1/2 z-20 ml-1.5 flex -translate-y-1/2 items-center gap-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      >
        {(Object.keys(BLOCK_COLORS) as BlockColorKey[]).map((colorKey) => (
          <button
            key={colorKey}
            type="button"
            role="menuitem"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onColorSelect?.(colorKey)}
            className="flex h-6 w-6 items-center justify-center rounded-md outline-none hover:ring-2 hover:ring-foreground/20 focus:ring-2 focus:ring-foreground/20"
            aria-label={BLOCK_COLORS[colorKey].label}
            title={BLOCK_COLORS[colorKey].label}
          >
            <span className={`h-4 w-4 rounded-full ${COLOR_DOT_CLASSES[colorKey]}`} />
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onColorSelect?.(null)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground"
          aria-label="Remove color"
          title="Remove color"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="menu"
      data-block-context-menu="true"
      className="absolute left-full top-1/2 z-20 ml-1.5 flex -translate-y-1/2 items-center gap-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      {options.map((option) => {
        const Icon = ACTION_ICON_BY_ID[option.id];

        return (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            disabled={option.disabled}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              if (option.disabled) {
                return;
              }

              if (option.id === "color") {
                setShowColors(true);
                return;
              }

              onAction(option.id);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors ${option.tone === "destructive" ? "text-destructive hover:bg-destructive/10 focus:bg-destructive/10" : "text-muted-foreground hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground"}`}
            aria-label={option.label}
            title={option.label}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}