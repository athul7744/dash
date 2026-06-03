# Test Suites

This folder holds the project's Vitest suites and lightweight test helpers.

## Layout

- `tests/notes/` — notes-specific logic and write-path tests.
- `tests/tasks/` — task-specific test entry points and notes about where task suites belong.
- `tests/tracker/` — tracker-specific test entry points and notes about where tracker suites belong.
- `tests/shared/` — reusable fixtures, builders, and assertions shared across app groups.

## Current Notes Suites

- `tests/notes/markdown-clipboard.test.ts`
  Verifies mdast-backed markdown clipboard parsing and block conversion for pasted note content, including nested children, task list markers, blockquote and heading routing, and single-block replacement decisions.

- `tests/notes/block-editor-keyboard.test.ts`
  Covers the notes editor keyboard decision layer for Enter, Shift+Enter, Tab, arrow navigation, and Backspace behavior under the plain-text-first editing model.

- `tests/notes/block-editor-structure.test.ts`
  Covers structural block outcomes for delete focus, merge planning, child reparenting, and indent/outdent placement.

- `tests/notes/notes-content.test.ts`
  Covers note document normalization, legacy text fallback, serialization, plain-text extraction, merge edge cases, and math node serialization (inline and block) for note content.

- `tests/notes/notes-tree.test.ts`
  Covers nested block tree construction plus visible-order neighbor lookups used by block navigation and merge behavior.

- `tests/notes/math-clipboard.test.ts`
  Covers LaTeX math token protection and restoration during markdown paste flows, including inline/block detection, HTML escaping, backslash unescaping, and roundtrip correctness.

- `tests/notes/note-block-store.test.ts`
  Covers the NoteBlockStore including hydration, block CRUD, move/indent/outdent, split/merge, content commit, undo/redo for all command types, ordered blocks caching, reconcile fast-path, query block setContentDirect, and store registry lifecycle.

- `tests/notes/note-page-utils.test.ts`
  Covers note page metadata helpers for stored tag id parsing and shared tag resolution from the shared tags table.

- `tests/notes/block-context-menu-options.test.ts`
  Covers context menu action generation for block types, including default actions and fallback behavior.

- `tests/notes/block-line-selection.test.ts`
  Covers block selection ranges, clipboard serialization with preserved nesting, and markdown fallback for multi-block clipboard operations.

- `tests/notes/note-block-editor.dom.test.ts`
  Runs jsdom-backed integration coverage for NoteBlockEditor DOM interactions including block splitting, navigation, backspace handling, selection, code blocks, and table operations.

- `tests/notes/notes-block-tree.dom.test.ts`
  Runs jsdom-backed integration coverage for NotesBlockTree component including paste routing, block deletion, Alt+arrow moving, selection handling, and context menu block operations.

- `tests/notes/useNotesSurfaceState.dom.test.ts`
  Runs jsdom-backed integration coverage for useNotesSurfaceState hook behavior covering editor content caching during page transitions and selected-page loading.

- `tests/notes/properties.test.ts`
  Covers property definition config parsing (parseJsonColumns) and custom property value extraction (parseCustomPropertyValues) including malformed JSON and empty inputs.

## Current Shared Suites

- `tests/shared/entity-store.test.ts`
  Covers the EntityStore base class including dirty tracking, debounced persistence, undo/redo stack overflow, markStructureDirty, onPersisted callbacks, and subscription versioning.

- `tests/shared/ranked-order.test.ts`
  Covers LexoRank ordering helpers for between-rank insertion, start/end ranks, and edge cases.

## Usage

- `npm test` — one-shot node-based Vitest run.
- `npm run test:dom` — jsdom-backed integration run.
- `npm run test:watch` — watch mode while developing.
- `node .\\node_modules\\vitest\\vitest.mjs run tests/notes` — focused node-based notes test run when working on notes behavior.
- `node .\\node_modules\\vitest\\vitest.mjs run --config vitest.dom.config.ts tests/notes/notes-block-tree.dom.test.ts` — focused DOM integration run for block tree behavior.

Keep new tests close to the app area they protect, and move reusable builders or assertions into `tests/shared/` once they are used by more than one suite.