"use client";

/**
 * The notes editor's extension list: the shared set with a syntax-highlighted code
 * block.
 *
 * Hoisted to a constant because it is immutable — every editor that built its own
 * list also rebuilt the `lowlight` grammar registry, and a screen can show several
 * editors at once.
 */

import type { Extensions } from "@tiptap/core";
import { common, createLowlight } from "lowlight";

import { CodeBlockWithToolbar } from "@/components/notes/NoteBlockEditorCode";

import { buildSharedExtensions } from "./extensions-shared";

function build(): Extensions {
  const lowlight = createLowlight(common);
  return buildSharedExtensions(CodeBlockWithToolbar.configure({ lowlight }));
}

export const NOTE_EDITOR_EXTENSIONS: Extensions = build();

/**
 * Build a fresh list.
 *
 * Prefer {@link NOTE_EDITOR_EXTENSIONS}: two editors sharing one extension array
 * are fine, but a caller that needs to configure a node differently needs its own.
 */
export function buildNoteEditorExtensions(): Extensions {
  return build();
}
