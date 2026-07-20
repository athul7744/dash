# Test Suites

This folder holds the project's Vitest suites and lightweight test helpers.

## Layout

- `tests/notes/` — notes-specific logic and write-path tests.
- `tests/tasks/` — task-specific test entry points and notes about where task suites belong.
- `tests/tracker/` — tracker-specific test entry points and notes about where tracker suites belong.
- `tests/quotes/` — quotes-specific logic tests.
- `tests/bookmarks/` — bookmarks-specific logic tests.
- `tests/reminders/` — reminders recurrence-engine tests.
- `tests/shared/` — reusable fixtures, builders, and assertions shared across app groups (incl. the universal-capture classifier).

## Current Notes Suites

- `tests/notes/notes-content.test.ts`
  Covers note document normalization, legacy text fallback, serialization, plain-text extraction, merge edge cases, and markdown serialization (inline/block math, and single-block `taskLine` checkboxes).

- `tests/notes/notes-tree.test.ts`
  Covers nested block tree construction plus visible-order neighbor lookups used by block ordering.

- `tests/notes/note-page-utils.test.ts`
  Covers note page metadata helpers for stored tag id parsing and shared tag resolution from the shared tags table.

- `tests/notes/block-context-menu-options.test.ts`
  Covers context menu action generation for block types, including default actions and fallback behavior.

- `tests/notes/note-page-shell.dom.test.tsx`
  Runs jsdom-backed integration coverage for the (store-free) NotePageShell: with mocked data hooks it derives rank+nesting-ordered blocks, builds the heading outline, mounts the editor, and shows the skeleton only while loading.

- `tests/notes/slash-commands.test.ts`
  Covers slash command filtering, grouping, and query matching logic used by the editor's slash-command palette.

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

- `tests/notes/reconcile-note-edges.test.ts`
  Covers diff-based, deterministic note edge reconciliation.

- `tests/notes/system-pages.test.ts`
  Covers `systemPageId`: deterministic ids per `(userId, kind, key)`, matching an explicit uuidv5 over the documented name scheme, and v5 uuid format.

- `tests/notes/graph.test.ts`
  Covers the pure graph helpers (`src/lib/notes/graph.ts`) behind the notes graph view: `buildGraph` collapsing block→page edges into an undirected, deduped, weighted page graph (self-links and edges to unknown pages dropped; degree computed), `neighborhood` BFS to a depth, and `isOrphan`.

- `tests/notes/prune-journal-pages.test.ts`
  Covers `pruneEmptyJournalPages`: deleting empty journal pages (single blank block or zero blocks), keeping pages with text or multiple blocks, never deleting the excepted (open) page, and pruning only the empty pages in a mixed set.

## Single-Document Editor Suites (`tests/notes/editor/`)

- `block-document.test.ts` — assemble rows → one doc / decompose doc → rows round-trips (ids, order, nesting), query round-trip, and legacy `taskList` → task-block migration (flat + nested).
- `block-schema.dom.test.ts` / `extensions.dom.test.ts` — the `block` schema + regrouped content nodes form a valid schema and round-trip content in a live editor.
- `block-id-plugin.test.ts` — stable block-id assignment + duplicate-id dedup on split/paste.
- `block-diff.test.ts` — churn-minimal rank/write diff (net-zero when nothing changed).
- `block-persister.test.ts` / `block-persister.dom.test.ts` — hydrate/flush/decompose + remote reconcile.
- `block-commands.dom.test.ts` — native Enter/Backspace/indent/outdent/move across every block type (paragraph, heading, task, quote, code, divider, multi-item), incl. undo.
- `block-normalize.dom.test.ts` — the one-content-node-per-block invariant (splits accidental "frankenblocks").
- `slash-single.dom.test.ts` — slash detection + apply (heading/quote/color/query/task conversions).
- `task-shortcut.dom.test.ts` — the `[]`/`[x]` markdown checkbox input rule converts a paragraph into a task block.
- `markdown-block-shortcuts.dom.test.ts` — the divider (`---`), image (`![]()`), and block-color (`!blue`/`!none`) input rules, driven through a live editor.
- `paste.dom.test.ts` — external multi-paragraph paste becomes well-formed blocks; copied blocks get fresh ids.
- `markdown-paste.test.ts` — `markdownToBlockNodes` maps every markdown construct (headings, paragraphs, bullet/ordered/task lists incl. nesting, blockquotes, fenced code, thematic breaks, GFM tables, inline marks, hard breaks) to the right block/`taskLine` shape; `looksLikeMarkdown` + `clipboardMarkdown` detection/routing (prose left alone, structured HTML deferred to native paste); `isBareUrl` single-URL detection. Includes fixtures ported from the removed markdown-clipboard suite.
- `markdown-paste.dom.test.ts` — parsed markdown inserts into a live editor as schema-valid nodes with zero frankenblocks, one content node per block, and freshly-stamped ids; the single inline-formatted paragraph merges into the current line; `pasteUrlAsLink` links a pasted bare URL (inserts linked text, normalizes bare domains, wraps a selection, and leaves no stored mark).
- `reference-resolver.dom.test.ts` — `getResolvedPageReferenceAtPosition` resolves the `[[title]]` under the cursor.
- `read-only-block-renderer.dom.test.tsx` — `ReadOnlyBlockRenderer` renders heading/paragraph/task blocks non-editably through the single-doc schema.

## Current Shared Suites

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

- `tests/shared/greeting.test.ts`
  Covers the greeting helpers: `timeOfDayForHour` boundaries, deterministic `greetingForHour`/`sublineForIndex` selection, index wrapping, and non-empty variants.

- `tests/shared/motion.test.ts`
  Covers the shared Motion token vocabulary (`src/lib/shared/motion.ts`): duration ordering, easing tuples, the soft spring, stagger step, and the entrance/stagger/popover variants.

- `tests/shared/capture.test.ts`
  Covers the universal-capture classifier (`src/lib/shared/capture.ts`): `detectPlatform` host recognition (YouTube/Instagram/X/Reddit/GitHub, null otherwise), `looksLikeQuote`, and `classifyShare` picking the smart default target (URL → bookmark + platform, short text → quote, prose → note, empty → note; URL-in-text extraction).

## Current Quotes Suites

- `tests/quotes/daily.test.ts`
  Covers `pickDailyQuote` (`src/lib/quotes/daily.ts`): empty → null, single-quote stability, determinism within a local day, advancing across days, favorites-weighted bias, and the no-favorites fallback.

## Current Bookmarks Suites

- `tests/bookmarks/daily.test.ts`
  Covers `pickDailyBookmark` (`src/lib/bookmarks/daily.ts`): empty → null, determinism within a day, advancing across days, unread-weighted bias, and the no-unread fallback.

- `tests/bookmarks/metadata.test.ts`
  Covers `parseMetadataHtml` (`src/lib/bookmarks/metadata.ts`): preferring `og:title` over `<title>`, entity decoding, description/image extraction in either attribute order, the `description` meta fallback, and empty output for missing tags / malformed HTML.

## Current Reminders Suites

- `tests/reminders/schedule.test.ts`
  Covers the pure recurrence engine (`src/lib/reminders/schedule.ts`): `nextOccurrenceOnOrAfter` for once/weekly/monthly/yearly incl. month-length clamping (day 31 → Feb 28, Feb 29 → Feb 28 in a non-leap year) and past-`once` → null; `formatSchedule` summaries; and `dueOccurrence` (lead-window boundary, `lastMaterializedKey` suppression, advancing to the next occurrence).

## Current Tracker Suites

- `tests/tracker/day-keys.test.ts`
  Covers the tracker date-key helpers: `utcDateKey`/`localDateKey`/`utcDayBounds` formats and `recentNaiveWindow` (2-hour UTC-naive span, midnight crossing).

## Current Dashboard Suites

- `tests/dashboard/hero-action.test.ts`
  Covers `chooseHeroAction`, the hero's next-best-action picker: time-of-day + data-driven selection across task/plan/track/journal/mood, eligibility gates, and the plan fallback.

## Usage

- `bun run test` — one-shot node-based Vitest run.
- `bun run test:dom` — jsdom-backed integration run. Uses `tests/setup/dom.ts` (via `setupFiles`) to stub `window.matchMedia` and set `MotionGlobalConfig.skipAnimations` so Motion components mount and `AnimatePresence` exits resolve synchronously under jsdom.
- `bun run test:watch` — watch mode while developing.
- `bunx vitest run tests/notes` — focused node-based notes test run when working on notes behavior.
- `bunx vitest run --config vitest.dom.config.ts tests/notes/editor/block-commands.dom.test.ts` — focused DOM integration run for editor block-command behavior.

Keep new tests close to the app area they protect, and move reusable builders or assertions into `tests/shared/` once they are used by more than one suite.