import { Extension } from "@tiptap/core";

/**
 * Block color attribute — adds an optional `color` attribute to paragraph,
 * heading, blockquote, and taskList nodes. The color value is one of the
 * BLOCK_COLORS keys or null (no color).
 */

export const BLOCK_COLORS = {
  gray: { label: "Gray", light: "oklch(0.93 0.01 250)", dark: "oklch(0.28 0.01 250)" },
  brown: { label: "Brown", light: "oklch(0.88 0.05 55)", dark: "oklch(0.28 0.04 55)" },
  orange: { label: "Orange", light: "oklch(0.90 0.08 65)", dark: "oklch(0.30 0.07 55)" },
  yellow: { label: "Yellow", light: "oklch(0.93 0.09 95)", dark: "oklch(0.32 0.07 90)" },
  green: { label: "Green", light: "oklch(0.91 0.08 150)", dark: "oklch(0.30 0.06 155)" },
  blue: { label: "Blue", light: "oklch(0.90 0.07 240)", dark: "oklch(0.30 0.06 245)" },
  purple: { label: "Purple", light: "oklch(0.90 0.07 300)", dark: "oklch(0.30 0.06 300)" },
  pink: { label: "Pink", light: "oklch(0.90 0.08 350)", dark: "oklch(0.30 0.07 345)" },
} as const;

export type BlockColorKey = keyof typeof BLOCK_COLORS;

export const BlockColor = Extension.create({
  name: "blockColor",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "blockquote", "taskList", "codeBlock"],
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-color") || null,
            renderHTML: (attributes) => {
              if (!attributes.color) return {};
              return { "data-block-color": attributes.color };
            },
          },
        },
      },
    ];
  },
});
