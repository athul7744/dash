"use client";

/**
 * The journal's extension list: the shared set with a plain code block.
 *
 * A journal entry is prose. It needs `[[refs]]` and `{date}` chips, links, lists,
 * tasks, quotes and math — the whole shared schema — but not syntax highlighting,
 * and the highlighter is a large module plus a per-list grammar registry. Leaving
 * it out here keeps it out of the tracker route's bundle, where up to seven
 * entries can be mounted at once.
 *
 * The code block node itself stays: markdown pasted into a journal can contain a
 * fenced block, and a node type missing from the schema would make that stored
 * content unparseable. It renders as plain preformatted text.
 */

import type { Extensions } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";

import { buildSharedExtensions } from "./extensions-shared";

export const JOURNAL_EDITOR_EXTENSIONS: Extensions = buildSharedExtensions(CodeBlock);
