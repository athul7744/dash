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
  Covers the NoteBlockStore including hydration, block CRUD, move/indent/outdent, split/merge, content commit, undo/redo for all command types, ordered blocks caching, reconcile fast-path, query block setContentDirect, net-zero flush skipping, failed-flush delta retention/retry, and store registry lifecycle.

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

- `tests/notes/note-page-shell.dom.test.ts`
  Runs jsdom-backed integration coverage for NotePageShell component including skeleton rendering, isReady handle state, backlink counts, linked references, and block state reflection.

- `tests/notes/slash-commands.test.ts`
  Covers slash command filtering, grouping, and query matching logic used by the block editor command palette.

- `tests/notes/date-tokens.test.ts`
  Covers date token formatting and relative date resolution for inline date slash commands.

- `tests/notes/page-nav-stack.test.ts`
  Covers pure push/pop/popTo logic for the page breadcrumb navigation stack.

- `tests/notes/notes-write.test.ts`
  Covers immediate starter-page creation write behavior.

- `tests/notes/properties.test.ts`
  Covers property definition config parsing (parseJsonColumns) and custom property value extraction (parseCustomPropertyValues) including malformed JSON and empty inputs.

- `tests/notes/query-block-content.test.ts`
  Covers the query-block content codec: encoding a config into a `queryBlock` note document, round-tripping, decoding JSON strings and legacy raw-config forms, and default values.

- `tests/notes/use-optimistic-value.dom.test.ts`
  Covers the useOptimisticValue hook: immediate optimistic display, clearing once upstream catches up, surviving reference-only upstream changes (no flicker), and adopting genuine upstream changes.

- `tests/notes/use-note-block-store-actions.dom.test.tsx`
  Covers the React binding hook between NoteBlockStore and the component tree (block mutation callbacks and store subscription).

- `tests/notes/reconcile-note-edges.test.ts`
  Covers diff-based, deterministic note edge reconciliation.

- `tests/notes/system-pages.test.ts`
  Covers `systemPageId`: deterministic ids per `(userId, kind, key)`, matching an explicit uuidv5 over the documented name scheme, and v5 uuid format.

- `tests/notes/prune-journal-pages.test.ts`
  Covers `pruneEmptyJournalPages`: deleting empty journal pages (single blank block or zero blocks), keeping pages with text or multiple blocks, never deleting the excepted (open) page, and pruning only the empty pages in a mixed set.

## Current Shared Suites

- `tests/shared/entity-store.test.ts`
  Covers the EntityStore base class including dirty tracking, debounced persistence, undo/redo stack overflow, undo/redo availability for subscribers notified during apply, markStructureDirty, onPersisted callbacks, and subscription versioning.

- `tests/shared/ranked-order.test.ts`
  Covers LexoRank ordering helpers for between-rank insertion, start/end ranks, and edge cases.

- `tests/shared/debounced-update.test.ts`
  Covers debounced field updates and execute batching, including per-`table:id` keying and flush ordering.

- `tests/shared/share.test.ts`
  Covers incoming share payload parsing, safe next-path sanitization, and task title generation.

- `tests/shared/display-font.test.ts`
  Covers the display-font config: the offered faces and order, the default being an offered face, the `isDisplayFont` guard, and each option mapping to a CSS-var font-family.

- `tests/shared/use-display-font.dom.test.ts`
  Covers the useDisplayFont hook: defaulting to Fraunces, reading a stored font, ignoring invalid stored values, persisting a non-default choice to `<body data-display-font>` + localStorage, and clearing the attribute when the default is re-selected.

## Usage

- `npm test` — one-shot node-based Vitest run.
- `npm run test:dom` — jsdom-backed integration run.
- `npm run test:watch` — watch mode while developing.
- `node .\\node_modules\\vitest\\vitest.mjs run tests/notes` — focused node-based notes test run when working on notes behavior.
- `node .\\node_modules\\vitest\\vitest.mjs run --config vitest.dom.config.ts tests/notes/notes-block-tree.dom.test.ts` — focused DOM integration run for block tree behavior.

Keep new tests close to the app area they protect, and move reusable builders or assertions into `tests/shared/` once they are used by more than one suite.