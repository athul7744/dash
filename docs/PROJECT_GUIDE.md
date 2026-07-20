# Project Guide

This document is the technical reference for developers and coding agents working on Dash.

Use this together with:

- [README.md](../README.md) for product overview
- [SETUP.md](../SETUP.md) for environment setup, backend provisioning, and deployment

## Tech Stack

Next.js 16 · PowerSync · Supabase · Tailwind CSS v4 · Shadcn/UI · Tiptap 3.22.5 · KaTeX · Vitest · Serwist

## What Dash Is

Dash is an offline-first Next.js application with six apps under one shell:

- `Tasks` — todo management with subtasks, tags, due dates, priorities, and trash/restore
- `Tracker` — time-block logging on a 7-day x 24-hour grid, daily mood ratings, yearly heatmaps, and weekly widgets
- `Notes` — a local-first outline editor built on pages, blocks, graph edges, and explicitly owned attachments
- `Quotes` — a collection of quotes stored in the notes backend (a hidden `kind: "quote"` system page) with a favorites-weighted daily resurfacing on the dashboard
- `Bookmarks` — saved links stored in the notes backend (a hidden `kind: "bookmark"` system page) with platform detection, server-fetched titles, tags, read/unread, and an unread-weighted daily "revisit"
- `Reminders` — recurring task templates stored in the notes backend (a hidden `kind: "reminder"` system page) with a schedule + lead time; a client-side reconciler materializes a real Task before each occurrence (see [Reminders App Structure](#reminders-app-structure))

Content enters through **universal capture**: the PWA share target (`/share`) and an in-app quick-capture modal both classify shared links/text and triage them into any app (see [Universal Capture](#universal-capture)). Quotes, Bookmarks, and Reminders reuse the notes `pages`/`blocks` store via the system-page mechanism, so they add no new tables.

Testing is organized separately under `tests/`, with app-group suites and shared helpers rather than colocated source tests.

The app is designed so the browser-local database is the primary runtime source of truth. UI reads and writes happen against local SQLite through PowerSync, and cloud sync happens in the background.

## High-Level Architecture

```mermaid
graph LR
    User([User]) <--> UI[Next.js App Router UI]
    UI <--> LocalDB[(Local SQLite via PowerSync)]
    LocalDB <--> Sync[PowerSync Sync Engine]
    Sync <--> Cloud[(Supabase Postgres)]
```

Key runtime behavior:

1. The app boots the local PowerSync-backed SQLite database first.
2. Once local DB init completes, the UI renders from cached local data.
3. Cloud sync is connected in the background and should not block initial UI paint.
4. Many writes are debounced or optimistic so the interface stays responsive even when sync is behind.

## Root App Structure

### App Router shell

- `src/app/layout.tsx`
  - Root HTML shell
  - Mounts `ThemeProvider`, `PowerSyncProvider`, and Vercel analytics
  - `<body>` carries `suppressHydrationWarning` because the pre-paint display-font script mutates its attributes before hydration
  - Defines the global full-height app layout
  - Loads the app's fonts via `next/font`: Inter (body), Lora (serif/journal), Geist Mono (code), plus the display candidates Fraunces / Hanken Grotesk / Bricolage Grotesque. Each exposes a CSS var; the active display face is applied by a small pre-paint inline script that sets `data-display-font` on `<body>` from `localStorage` (see [Typography](#typography-and-display-font))

- `src/components/powersync-provider.tsx`
  - Initializes local SQLite first with `initLocal()`
  - Only after local init succeeds does it render the app tree
  - Starts `connectCloud()` in the background so sync does not block the UI

### Shared shell components

- `src/components/AppHeader.tsx`
  - Shared sticky header used by app pages
  - Renders differently on mobile and desktop
  - Handles theme toggle, sync indicator, logout, and mobile overflow menu

- `src/components/AppSwitcher.tsx`
  - App-to-app switcher used in the shell
  - Uses the registry in `src/lib/shared/apps.ts`
  - Prefetches other app routes for faster handoff

- `src/components/MobileBottomFabs.tsx`
  - Shared mobile bottom shell used by tasks and tracker
  - Holds the app switcher plus app-specific primary actions

- `src/components/SyncIndicator.tsx`
  - Displays PowerSync connection/upload/download state
  - Used in the header so sync state is always visible

- `src/components/SettingsDialog.tsx`
  - Responsive settings surface (centered dialog on desktop, bottom drawer on mobile)
  - Sections: Account, Appearance (theme), Display font, Notifications (web push), Data (reset local data)
  - The Display font section uses `useDisplayFont` (see [Typography](#typography-and-display-font))

### Route-level loading behavior

- `src/app/{tasks,tracker,notes,quotes,bookmarks,reminders}/loading.tsx`
  - Route-level fallback for navigation into each app
  - Each renders the real header shell plus an app-specific skeleton from `src/components/skeletons/*` (shared with the cold-start boot skeleton)

- `src/components/AppBootSkeleton.tsx`
  - Cold-start fallback (shown by `powersync-provider` while the local DB opens) that picks the route-shaped skeleton by pathname (and `?view=`/`?page=` for tracker/notes), so a refresh boots into the matching skeleton with no blank gap

Important convention:

- The header is treated as stable app chrome, not data-dependent content.
- Loading UI should generally appear below the real header when possible.

## Directory Map

### Routes

- `src/app/page.tsx` — the welcome dashboard (home/start page; see [Dashboard](#dashboard-structure))
- `src/app/login/page.tsx` — login page
- `src/app/share/page.tsx` — PWA share target → universal capture triage (see [Universal Capture](#universal-capture))
- `src/app/tasks/page.tsx` — tasks dashboard
- `src/app/tracker/page.tsx` — tracker dashboard
- `src/app/notes/page.tsx` — notes dashboard shell
- `src/app/quotes/page.tsx` — quotes collection
- `src/app/bookmarks/page.tsx` — bookmarks collection
- `src/app/reminders/page.tsx` — reminders collection (recurring task templates; see [Reminders App Structure](#reminders-app-structure))
- `src/app/api/bookmark-metadata/route.ts` — auth-gated, SSRF-guarded server proxy that fetches a URL's `<title>`/OG metadata (used by bookmarks + capture to prefill titles)

### Shared components

- `src/components/AppHeader.tsx`
- `src/components/AppSwitcher.tsx`
- `src/components/MobileBottomFabs.tsx`
- `src/components/SyncIndicator.tsx`
- `src/components/LogViewerDialog.tsx`
- `src/components/ManageNamedColorItemsDialog.tsx`
- `src/components/tags/*` — shared tag selection and pill-strip primitives used by tasks and notes
- `src/components/motion/*` — the shared Motion primitives (see **Motion system** below): `Reveal` (scroll reveal), `FadeIn` (entrance wrapper), `AnimatedList` + `MotionListItem` (staggered enter/exit lists), `Presence` (hand-rolled popover enter/exit). All honor reduced-motion.

### Dashboard components

- `src/components/dashboard/DashboardHero.tsx` — the centered hero (greeting, search bar, contextual action/mood)
- `src/components/dashboard/DashboardGreeting.tsx` — presentational greeting: the date as a small serif eyebrow above the greeting (centered stack)
- `src/components/dashboard/HeroAction.tsx` — the contextual nudge button (opens a task, scrolls to a section, or navigates)
- `src/components/dashboard/MoodPicker.tsx` — 1–5 mood dots writing to `daily_ratings` (night hero + shared)
- `src/components/dashboard/GlobalSearch.tsx` — controlled combined tasks+notes search (built on `SearchPopup`)
- `src/components/dashboard/TaskPopup.tsx` — opens a `TaskCard` in a blurred modal (tasks have no deep-link route)
- `src/components/dashboard/TodayTasks.tsx` / `TodayTracking.tsx` — borderless reveal widgets
- `src/components/dashboard/DashboardQuote.tsx` / `DashboardBookmarks.tsx` — the daily "quote of the day" / "revisit" resurfacing cards (a `variant` renders either the compact dashboard tile or the larger hero atop `/quotes` and `/bookmarks`); render nothing until there's content
- `src/components/dashboard/DashboardJournal.tsx` — embeds `WeeklyJournal` for the current week, editable in place
- `src/components/dashboard/AppsFab.tsx` — bottom horizontal app strip (single-click nav) over a blurred scrim; a dashboard-specific order (bookmarks, tasks, tracker, notes, quotes) centered on Tracker, with the ends scroll-reachable on narrow screens
- `src/components/capture/QuickCapture.tsx` — in-app capture modal (opened by the dashboard Capture button / ⌘Ctrl+Shift+K); seeds `CaptureTriage` from the clipboard (see [Universal Capture](#universal-capture))

### Task-specific components

- `src/components/tasks/TaskCard.tsx`
- `src/components/tasks/TaskMetadataEditor.tsx`
- `src/components/tasks/ManageTagsDialog.tsx`
- `src/components/tasks/TasksPageSkeleton.tsx`

### Tracker-specific components

- `src/components/tracker/ActivityToolbar.tsx`
- `src/components/tracker/TimeGrid.tsx`
- `src/components/tracker/WeekNavigator.tsx`
- `src/components/tracker/WeekViewSkeleton.tsx`
- `src/components/tracker/WeeklyJournal.tsx`
- `src/components/tracker/YearActivityGrid.tsx`
- `src/components/tracker/YearRatingGrid.tsx`
- `src/components/tracker/ManageActivitiesDialog.tsx`
- `src/components/tracker/widgets/*`

### Notes-specific components

- `src/components/notes/editor/*` — the single-document editor: `SingleBlockEditor` mount, the plain-DOM block NodeView (`blockNodeViewDom.ts`), the `taskLine`/`queryBlock` nodes, and the shared React overlays (`BlockMenuLayer`, `SlashMenuLayer`, `RefMenuLayer`, `TableToolbarLayer`)
- `src/components/notes/NoteBlockEditorExtensions.ts` / `NoteBlockEditorMath.ts` / `NoteBlockEditorCode.ts` / `NoteBlockEditorColor.ts` / `NoteBlockEditorSlash.ts` — shared Tiptap nodes, marks, and extensions reused by the editor schema
- `src/components/notes/ReadOnlyBlockRenderer.tsx` — non-editable render of a page's blocks (peek/backlink previews) through the same schema
- `src/components/notes/BlockContextMenu.tsx`
- `src/components/notes/block-context-menu-options.ts`
- `src/components/notes/ManagePropertiesDialog.tsx`
- `src/components/notes/MobileRailDrawer.tsx`
- `src/components/notes/page/*`

### Library folders

- `src/lib/shared/apps.ts` — app registry used by header/switcher/FAB shell
- `src/lib/shared/auth.ts` — current-user lookup with session caching
- `src/lib/shared/share.ts` — parsing incoming share payloads and title generation
- `src/lib/shared/capture.ts` — pure capture classifier (`classifyShare`, `detectPlatform`, `looksLikeQuote`); no DB imports so it stays testable
- `src/lib/shared/capture-actions.ts` — `saveCapture` dispatcher that writes a capture into the chosen app (bookmark/quote/task/note) + `captureResultHref`
- `src/lib/shared/daily-pick.ts` — shared deterministic "of the day" primitives (`dayNumber`, `hashInt`, pool/index salts) reused by the quotes + bookmarks daily picks
- `src/lib/shared/debounced-update.ts` — debounced local writes and execute batching
- `src/lib/shared/logger.ts` — runtime logging abstraction
- `src/lib/shared/ranked-order.ts` — reusable LexoRank ordering helpers that can be shared across app groups
- `src/lib/shared/utils.ts` — shared UI/class/date/escapeHtml helpers
- `src/lib/shared/display-font.ts` — display-font options, storage key, and the `isDisplayFont` guard (see [Typography](#typography-and-display-font))
- `src/lib/shared/greeting.ts` — pure time-of-day greeting pools + `timeOfDayForHour` (used by the dashboard hero and the next-best-action picker)
- `src/lib/shared/motion.ts` — the shared Motion vocabulary (durations, easings, spring, variants); the single source of truth for animation feel, mirrored by the CSS `--motion-*` tokens (see [Motion system](#motion-system))
- `src/lib/dashboard/hero-action.ts` — pure rule+weighted-score picker (`chooseHeroAction`) for the hero's contextual nudge
- `src/lib/tasks/colors.ts` — tag palette and class maps
- `src/lib/tasks/tasks.ts` — priority, due-date, and URL helpers (`normalizeUrl`/`getLinkHost`/`extractFirstUrl`); pure (no DB) so the capture classifier can import it
- `src/lib/tasks/create-task.ts` — `createTask(...)` (extracted from the inline INSERTs so share/capture share one path)
- `src/lib/tasks/tags.ts` — tag creation helpers
- `src/lib/quotes/quotes.ts` / `quotes/daily.ts` — quote CRUD over the `kind:"quote"` system page, and the favorites-weighted `pickDailyQuote`
- `src/lib/bookmarks/bookmarks.ts` / `bookmarks/daily.ts` / `bookmarks/metadata.ts` / `bookmarks/fetch-metadata.ts` — bookmark CRUD over the `kind:"bookmark"` system page, the unread-weighted `pickDailyBookmark`, the pure `parseMetadataHtml` (used by the metadata route), and the client `refreshBookmarkTitle` wrapper
- `src/lib/reminders/reminders.ts` / `reminders/schedule.ts` / `reminders/materialize.ts` — reminder CRUD over the `kind:"reminder"` system page, the pure recurrence engine, and the on-mount reconciler that materializes due reminders into Tasks (see [Reminders App Structure](#reminders-app-structure))
- `src/lib/tracker/activities.ts` — tracker activity palette and class maps
- `src/lib/tracker/ratings.ts` — `setDailyRating` upsert (insert/update/clear) for the mood picker, shared by the dashboard
- `src/lib/tracker/day-keys.ts` — UTC-naive/local date-key helpers, incl. `recentNaiveWindow` for the "logged in the last 2h" check
- `src/hooks/use-notes.ts` — local SQLite query hooks for note pages and blocks (excludes `properties.kind`-tagged system pages from Notes lists)
- `src/hooks/use-quotes.ts` / `src/hooks/use-bookmarks.ts` / `src/hooks/use-reminders.ts` — live query hooks reading the quote/bookmark/reminder blocks off their system page (a "settled" latch keeps the empty state from flashing during the page-id → query swap); `use-reminders.ts` also exports `useReminderMaterializer`
- `src/hooks/use-autosize-textarea.ts` — grows a textarea to fit its content, recomputing on width/masonry-column changes (quote + bookmark cards)
- `src/hooks/use-display-font.ts` — reads/writes the selected display font via `useSyncExternalStore` + `localStorage`, applying it to `<body data-display-font>`
- `src/hooks/use-settled-timestamp.ts` — debounced timestamp display that waits for pending writes to settle
- `src/hooks/use-edge-swipe.ts` — mobile edge swipe gesture detection
- `src/hooks/use-page-nav-stack.ts` — page navigation stack with sessionStorage persistence (used by breadcrumb)
- `src/hooks/use-property-definitions.ts` — reactive query hook for workspace property definitions
- `src/hooks/use-optimistic-value.ts` — generic optimistic-override hook (keyed on a serialized upstream snapshot) for edits that render before a DB write round-trips
- `src/hooks/use-greeting.ts` — snapshots the greeting/date once per mount (single seed shared by hero + collapsed top bar)
- `src/hooks/use-hero-action.ts` — gathers live signals (tasks, recent tracking, mood, journal) and returns the chosen hero action + most-relevant task
- `src/lib/notes/notes-content.ts` — note document normalization, serialization (including math nodes), and plain-text extraction
- `src/lib/notes/notes-tree.ts` — tree building and visible block ordering helpers for note blocks
- `src/lib/notes/editor/*` — the single-document editor's non-React core: `block-schema` (the `block` wrapper node + `blockContent` grouping), `block-document` (assemble rows → one doc / decompose doc → rows, incl. legacy `taskList` → task-block migration), `block-diff` (churn-minimal rank/write diff), `block-persister` (debounced save + remote reconcile), `block-commands` (native split/merge/indent/outdent), `block-id-plugin` (stable block ids), `block-normalize` (one-content-node-per-block invariant), `slash-single` (slash detect/apply), `markdown-paste` (parse pasted raw markdown text → block/`taskLine` nodes; detection + insertion for the editor's `handlePaste`, incl. `pasteUrlAsLink` which links a pasted bare URL), and `extensions` (the assembled Tiptap extension list)
- `src/lib/notes/query-block-content.ts` — encode/decode codec between the query UI's `QueryBlockConfig` and the stored note document (config lives in a `queryBlock` node's attrs)
- `src/lib/notes/notes.ts` — note page CRUD, metadata writes, attachment upserts, edge reconciliation, and system-page helpers (`ensureSystemPage`, `pruneEmptyJournalPages`)
- `src/lib/notes/system-pages.ts` — deterministic ids for "system pages": notes pages tagged with `properties.kind` (e.g. `journal`) and located by `uuidv5(kind:userId:key)`, so features can reuse the notes store while staying hidden from `/notes`
- `src/lib/notes/page-nav-stack.ts` — pure push/pop/popTo logic for the page breadcrumb stack
- `src/lib/notes/properties.ts` — CRUD operations for property definitions and custom property value parsing

### PowerSync integration

- `src/lib/powersync/AppSchema.ts` — local schema definition
- `src/lib/powersync/db.ts` — database instance, init, connect, reconnect, reset
- `src/lib/powersync/SupabaseConnector.ts` — sync connector implementation

### Tests

- `tests/notes/*` — notes-specific Vitest suites
- `tests/tasks/*` — task-specific Vitest suites
- `tests/tracker/*` — tracker-specific Vitest suites
- `tests/quotes/*` / `tests/bookmarks/*` — quotes/bookmarks daily-pick + metadata suites
- `tests/reminders/*` — the recurrence-engine suite (`schedule.ts`)
- `tests/shared/*` — shared fixtures, builders, and assertions reused across app groups (incl. the capture classifier)
- `tests/README.md` — current suite map and short descriptions of what each test file covers

### Notes App Structure

Primary route:

- `src/app/notes/page.tsx`

Responsibilities:

- Registers the notes app in the shared shell and launcher.
- Orchestrates overview, editor, and graph surfaces via `?page=` / `?view=graph` route state.
- Reads pages, blocks, backlinks, attachments, and mentions from local SQLite through `src/hooks/use-notes.ts`.
- Resolves note page tag ids from `pages.properties.tags` through the shared `tags` table.
- Supports custom page properties stored in `pages.properties.custom`, resolved against workspace-wide `property_definitions`.
- Uses `ManagePropertiesDialog` for workspace-wide property definition CRUD (create, rename, delete, emoji icons, and select-option editing).
- Preserves the shared header-first loading model used across the app.
- The page is edited as ONE ProseMirror/Tiptap document (`SingleBlockEditor`): each `blocks` row is a `block` node, so split/merge/indent/nesting/selection/undo are all native ProseMirror behavior (one undo timeline — Ctrl+Z and the toolbar buttons are identical). The block-row DB model is unchanged; a persister assembles rows → doc on load and decomposes doc → rows on save.

Key modules:

- `src/components/notes/page/*`
  - Route-local overview, navigation, details, search, and supporting notes hooks.
  - Includes the notes editor header metadata row, which reuses the shared tag selector and tag pill strip.

- `src/components/notes/editor/SingleBlockEditor.tsx` + `useSingleBlockEditor.ts`
  - Mounts one Tiptap editor for the whole page from the block rows, owns the persister lifecycle + remote reconcile, and routes the structural keys (Enter/Tab/Backspace) through `editorProps.handleKeyDown` so block-level behavior beats plugin keymaps. Also handles `[[page]]` reference click/hover.

- `src/components/notes/editor/blockNodeViewDom.ts`
  - Plain-DOM NodeView for the `block` wrapper (a hover grip that opens the block menu). Plain DOM instead of a React NodeView per block keeps large pages fast; a single shared React `BlockMenuLayer` renders the actual menu.

- `src/components/notes/editor/BlockMenuLayer.tsx` / `SlashMenuLayer.tsx` / `RefMenuLayer.tsx` / `TableToolbarLayer.tsx`
  - One shared React overlay each (not per block): the grip's block menu (convert/color/move/delete), the caret-anchored slash-command menu, the `[[`-triggered page-link autocomplete (matching pages with their emoji), and the table add/delete row+column controls.

- `src/components/notes/MarkdownCheatsheetDialog.tsx`
  - Reference popup (opened from the editor's three-dot "Shortcuts" item) listing every markdown/keyboard shortcut, grouped and color-accented.

- `src/components/notes/graph/*` + `src/hooks/use-note-graph.ts` + `src/lib/notes/graph.ts`
  - Obsidian-style graph view of the vault. `graph.ts` holds pure helpers (`buildGraph` collapses block→page `edges` into an undirected, deduped, weighted page graph; `neighborhood` BFS; `isOrphan`); `use-note-graph.ts` is the reactive model (pages = nodes, resolved `[[links]]` = edges, node color from the page's first tag). `useForceSimulation` wraps `d3-force`; `NotesGraphCanvas` renders SVG with pan/zoom, zoom-to-fit, node drag-to-pin, and hover-neighbourhood highlight; `NotesGraphView` adds the controls (search, hide-orphans, tag filter, neighbour depth). Reached via the overview header's "Graph" button (`?view=graph`); clicking a node opens the page. `LocalGraphPanel` reuses the engine (mini variant) in the details rail's Connections tab to show the open page's neighbourhood. Only resolved links exist as edges, so links to not-yet-created pages don't appear.

- `src/components/notes/editor/TaskLineNode.ts` / `QueryBlockNode.tsx`
  - `taskLine` is a single checkbox line — each checklist item is its OWN block (`blockType: "task"`), no `taskList` wrapper. `queryBlock` is an atom NodeView rendering the existing `QueryBlockView`.

- `src/components/notes/NoteBlockEditorExtensions.ts` / `NoteBlockEditorMath.ts` / `NoteBlockEditorSlash.ts` / `NoteBlockEditorCode.ts` / `NoteBlockEditorColor.ts`
  - Shared Tiptap building blocks reused by the single-document schema: reference decorations (`[[page refs]]` + `{date}` tokens) / date auto-format / markdown links / arrow replacement; `LinkOpenControls` (a widget decoration that renders a small control group — an "open in browser" ↗ button plus a copy-link button — after each link, since links don't open on click); markdown-typing input rules that create blocks — divider (`---`), image (`![alt](url)`), checkbox (`[]`/`[x]`), and block color (`!blue`/`!none`) — alongside the ones each node ships (headings, quote, code, math); inline (`$...$`) and block (`$$...$$`) math with KaTeX NodeViews; the slash command catalog (+ filter/group helpers, including `/math`, `/todo`, `/date`); the code block toolbar; and per-block background colors.

- `src/lib/notes/editor/block-persister.ts`
  - Debounced per-page persister: decomposes the doc to rows, diffs against the last-known set (churn-minimal ranks, net-zero writes, failure retention), reconciles per-block edges, and merges remote row changes back into the open doc with `addToHistory:false`. `flushAllBlockDocumentPersisters()` flushes on `beforeunload`.
  - All block content shares one shape — a normalized note document. Query blocks store their config inside a `queryBlock` node's attrs (via `src/lib/notes/query-block-content.ts`), so nothing special-cases query content.

- `src/lib/notes/editor-document-helpers.ts`
  - `getResolvedPageReferenceAtPosition` — resolves the `[[title]]` under a cursor position (backs reference click/hover), plus related document helpers.

- `src/lib/notes/property-helpers.ts`
  - Property definition config parsing, property resolution, and option badge styling.

- `src/components/notes/BlockContextMenu.tsx`
  - `BlockContextMenuContent` — the positioning-free block-menu button row (type conversion, move, indent/outdent, color, delete) rendered by `BlockMenuLayer`.

- `src/components/notes/block-context-menu-options.ts`
  - Context menu option generation logic, providing block-type-aware action lists including block color.

- `src/components/notes/NotesPageBreadcrumb.tsx`
  - Breadcrumb navigation trail rendered in both desktop header and mobile bottom FAB. Shares a single nav stack managed by `src/hooks/use-page-nav-stack.ts` with sessionStorage persistence.

- `src/components/notes/QueryBlockView.tsx` / `QueryBlockFilters.tsx` / `QueryBlockCells.tsx`
  - Inline query block UI: filter builder, column selector, sorting, and cell renderers. Query blocks display filtered views of pages with property columns.
  - Config is encoded/decoded through `src/lib/notes/query-block-content.ts`; the result table sizes columns from shared width constants so rows span the full scrollable width.
  - Inline cell and tag edits are optimistic via `src/hooks/use-optimistic-value.ts`, and tag cells reuse the shared `TagSelector`.

- `src/components/notes/MobileRailDrawer.tsx`
  - Shared mobile drawer shell for the notes rails.

- `src/components/notes/page/NotesPagePeek.tsx`
  - Page peek preview shown on hover (desktop) or long-press (mobile) over page reference links.

Additional notes editor behavior:

- **Sticky headings** — heading blocks stick to the top of the scroll viewport for orientation in long documents.
- **Block colors** — blocks can be assigned a background color via the block (grip) menu. Colors persist per-block.
- **Markdown shortcuts** — every block type can be created by typing its markdown (`#`, `>`, ` ``` `, `---`, `[]`, `![]()`, `!color`, …); `[[` autocompletes page links and `{date}` renders a date token. The full list is in the editor's "Shortcuts" popup.
- **Date tokens** — typing `{May 2, 2025}` or the date slash commands (`/today`, `/tomorrow`, `/date`) inserts an inline date chip (low-emphasis slate style).
- **Hover grip** — a drag/menu handle appears in the left margin on hover; clicking it opens the block menu.
- **Emoji icons** — pages and property definitions use a Fluent Emoji Flat picker for visual identity.

Conventions:

- Keep `src/app/notes/page.tsx` as the route orchestrator and state wiring layer.
- Move reusable route-local UI and hooks into `src/components/notes/page/` before expanding the route file.
- Keep editor-owned helpers alongside the editor when they are specific to note block behavior.
- Attachments are owned by either a page or a block, never both.
- The whole page is one editor; there is no per-block mounting. Keep block chrome as plain DOM in the NodeView + one shared React overlay, not a React NodeView per block (that regressed perf at 100+ blocks).
- Page navigation triggers an entrance animation; the skeleton shows until the editor's blocks load.

### Custom Page Properties

The notes app supports Notion-style custom properties per page:

- **Schema**: `property_definitions` table holds workspace-wide definitions (name, type, config with optional icon and select options).
- **Per-page values**: Stored in `pages.properties.custom` as `{ [definitionId]: value }`.
- **Supported types**: text, number, date, select, checkbox, url.
- **UI**: `src/components/notes/page/NotePageProperties.tsx` renders a collapsible properties section below the page title with inline editors per type.
- **Management**: `src/components/notes/ManagePropertiesDialog.tsx` provides workspace-wide property definition CRUD with emoji picker, type selector, and select-option editing. Available on desktop via the header and on mobile via the 3-dots menu.
- **Data flow**: `src/lib/notes/properties.ts` handles definition CRUD and value parsing. `src/hooks/use-property-definitions.ts` provides reactive query access.

## Dashboard Structure

The home route (`src/app/page.tsx`) is the welcome dashboard and the app's `start_url`. It is its own scroll container (`absolute inset-0 overflow-y-auto`, positioned so Motion's `useScroll({ container })` can measure it) with `scroll-snap` between the hero and the reveal.

Responsibilities and behavior:

- **Hero collapse (Motion):** `useScroll` + `useTransform` map the container's raw `scrollY` (px) to a fade/scale on the hero and a fade-in of a compact greeting + search icon in the sticky top bar. Driven by raw `scrollY` (not a measured target) to avoid feedback from the hero's own transforms; bidirectional (reverses on scroll up).
- **Reveal:** each section is wrapped in `motion/Reveal` (`whileInView`, once) with the container as `root`; reduced-motion renders them static.
- **Contextual hero action:** `useHeroAction` gathers signals — pending/overdue/due-today tasks (and the most-relevant one), whether time was logged in the last 2h (`recentNaiveWindow`), whether mood was rated today, and whether this week's journal system page exists — and feeds the pure `chooseHeroAction` picker (`src/lib/dashboard/hero-action.ts`). At night it shows `MoodPicker`; otherwise a single `HeroAction` nudge (most-relevant task → task modal, plan → scroll to `#today-tasks`, track → `/tracker`, journal → scroll to `#weekly-journal`).
- **Search:** `GlobalSearch` is controlled (opened by the hero bar, the top-bar icon, or ⌘K), filters tasks by title and notes via `useNotesPageDerivedState`, and reuses `SearchPopup`. Notes deep-link to `/notes?page=`; tasks open in `TaskPopup`.
- **Journal:** `DashboardJournal` embeds the tracker's `WeeklyJournal` for the current week (same `systemPageId`), editable in place.
- **Apps:** `AppsFab` is a fixed bottom strip of single-click app links over a blurred scrim (replaces the old floating `AppSwitcher` FAB here); ordered bookmarks/tasks/tracker/notes/quotes and scroll-centered on Tracker so the middle app is reachable on launch.
- **Capture:** a Capture button in the top bar (and ⌘/Ctrl+Shift+K) opens `QuickCapture` (see [Universal Capture](#universal-capture)).
- Greeting text comes from `useGreeting` (one seed shared by hero + collapsed bar). There is no route restoration — the app always opens on the dashboard.

## Tasks App Structure

Primary route:

- `src/app/tasks/page.tsx`

Responsibilities:

- Runs the main task list query and tag filter query from local SQLite
- Maintains local UI filter state for task state, priority, tag filters, and pagination
- Keeps optimistic draft tasks in memory before they are persisted
- Renders the shared header plus a tasks-specific filter row
- Uses `TaskCard` for task editing and subtask management
- Uses `ManageTagsDialog` for tag CRUD
- Uses `MobileBottomFabs` for the floating add action on mobile

Important child components:

- `src/components/tasks/TaskCard.tsx`
  - Owns inline task editing behavior
  - Handles title, priority, due date, tags, state changes, and subtasks
  - Uses `debouncedUpdate()` for merged updates
  - Uses optimistic local state for deletes and subtasks

- `src/components/tasks/TaskMetadataEditor.tsx`
  - Shared due-date and tag picker row
  - Used inside both task editing and the `/share` task creation flow

- `src/components/tasks/ManageTagsDialog.tsx`
  - Thin wrapper around the shared named-color CRUD dialog
  - Tags persistence still uses the tags helper in `src/lib/tasks/tags.ts`

- `src/components/tasks/TasksPageSkeleton.tsx`
  - Shared loading primitives for tasks route fallback and in-page loading state

Tasks page loading model:

- Route navigation into `/tasks` uses `src/app/tasks/loading.tsx`
- In-page initial query loading uses `TasksFilterRowSkeleton` and `TasksContentSkeleton`
- The header remains real chrome instead of being skeletonized

## Tracker App Structure

Primary route:

- `src/app/tracker/page.tsx`

Responsibilities:

- Loads activity types, time logs, and daily ratings from local SQLite
- Manages three tracker views: `week`, `activity`, and `mood`
- Keeps optimistic in-memory overlays for time log and rating changes
- Uses URL search params for the active tracker subview (`?view=...`)
- Renders the shared header and a tracker-specific tab strip
- Uses `ManageActivitiesDialog` for activity CRUD

Important child components:

- `src/components/tracker/ActivityToolbar.tsx`
  - Activity selection row for painting the week grid

- `src/components/tracker/TimeGrid.tsx`
  - Main 7-day x 24-hour time grid
  - Clicking a cell writes or clears a time log entry

- `src/components/tracker/WeekNavigator.tsx`
  - Desktop header navigator plus mobile FAB navigator

- `src/components/tracker/WeekViewSkeleton.tsx`
  - Shared skeleton for the week view body

- `src/components/tracker/YearActivityGrid.tsx`
  - Year heatmap for tracked activity

- `src/components/tracker/YearRatingGrid.tsx`
  - Year calendar heatmap for daily mood ratings

- `src/components/tracker/ManageActivitiesDialog.tsx`
  - Thin wrapper around the shared named-color CRUD dialog

- `src/components/tracker/widgets/*`
  - Weekly analytics and summaries used below the grid

- `src/components/tracker/WeeklyJournal.tsx`
  - Per-week journal rendered below the widgets in the Week view
  - Each week maps to one lazily created notes "system page" (`kind: "journal"`, keyed by the Monday date via `systemPageId`), reusing the single-document editor (`SingleBlockEditor`)
  - Stays mounted across weeks (user id fetched once); the inner editor is keyed by page id so it re-hydrates per week
  - Opportunistically calls `pruneEmptyJournalPages(currentPageId)` on week change to clean up untouched empty weeks; never deletes the open week's page (StrictMode-safe)

Tracker loading model:

- Route navigation into `/tracker` uses `src/app/tracker/loading.tsx`
- Within the page, `loadingActivities || loadingLogs` shows `WeekViewSkeleton` for the week view body
- The shared header remains real chrome during route loading

## Shared Named-Color CRUD Pattern

The tag and activity management dialogs now share one reusable primitive:

- `src/components/ManageNamedColorItemsDialog.tsx`

This component owns:

- dialog open behavior
- create input and color picker UI
- optimistic create overlays
- optimistic color updates
- delete confirmation dialog before removing items
- reconciliation between optimistic and persisted rows

It is wrapped by:

- `src/components/tasks/ManageTagsDialog.tsx`
- `src/components/tracker/ManageActivitiesDialog.tsx`

The shared tag selection UI lives separately in:

- `src/components/tags/TagSelector.tsx`
- `src/components/tags/TagPillStrip.tsx`

Tasks and notes both resolve against the same `public.tags` rows, so changes to tag names or colors should be reflected consistently across both apps.

If one of these dialogs breaks, start with the shared component first.

## Universal Capture

Two entry points, one triage component:

- **PWA share target** — `src/app/share/page.tsx`. The manifest (`public/manifest.json`) declares a GET `share_target` at `/share`; on an installed Android PWA a shared link/text lands here. (iOS Safari doesn't support Web Share Target — deferred.)
- **In-app quick capture** — `src/components/capture/QuickCapture.tsx`, opened from the dashboard Capture button or ⌘/Ctrl+Shift+K; seeds the triage from the clipboard.

Both render `src/components/capture/CaptureTriage.tsx`, which:

- classifies the payload with `classifyShare` (`src/lib/shared/capture.ts`) → a smart default target (URL → Bookmark with platform detected, short text → Quote, prose → Note)
- holds one shared field model (title / text / url), so fetched metadata and edits persist when the user switches the target chip; a URL auto-fetches its title/description via `/api/bookmark-metadata` into the active fields
- saves through `saveCapture` (`src/lib/shared/capture-actions.ts`) → `createBookmark` / `createQuote` / `createTask` / `createNoteFromText`, then shows an inline "Saved to X" state (no toast system)

All writes are local (offline-safe). The proxy (`src/proxy.ts`) preserves `/share?...` across a login round-trip via `sanitizeNextPath`.

## Quotes App Structure

Route: `src/app/quotes/page.tsx`. Quotes are `type:"quote"` blocks on one hidden system page (`kind:"quote"`, key `"library"`) — no schema change. `src/lib/quotes/quotes.ts` is the CRUD layer, `src/hooks/use-quotes.ts` the live query, `QuoteCard` the editable card (masonry list), and `DashboardQuote` the favorites-weighted daily "quote of the day" (dashboard tile + `variant="hero"` atop `/quotes`).

## Bookmarks App Structure

Route: `src/app/bookmarks/page.tsx`. Bookmarks are `type:"bookmark"` blocks on one hidden system page (`kind:"bookmark"`, key `"library"`). `src/lib/bookmarks/bookmarks.ts` is the CRUD layer (content JSON holds `url/title/note/tags/favorite/unread/addedAt`; tag ids reuse the shared `tags` table), `src/hooks/use-bookmarks.ts` the live query, `BookmarkCard` the editable card (favicon, title, note, tags, read/unread, star, per-card refresh), and `DashboardBookmarks` the unread-weighted daily "revisit". Titles are fetched server-side via `/api/bookmark-metadata` (auth-gated + SSRF-guarded); a single omni-field on the page does both search and paste-to-add.

## Reminders App Structure

Route: `src/app/reminders/page.tsx`. Reminders are `type:"reminder"` blocks on one hidden system page (`kind:"reminder"`, key `"schedules"`) — no schema change. Each block's content JSON holds a task template (`title/link/tags/priority`), a `schedule`, a `daysBefore` lead time, `active`, and materialization bookkeeping (`lastMaterializedKey`, `lastTaskId`).

- `src/lib/reminders/schedule.ts` — the pure, DB-free recurrence engine (like `capture.ts`, so tests don't load PowerSync): the `ReminderSchedule` union (`once`/`weekly`/`monthly`/`yearly`), `nextOccurrenceOnOrAfter` (local-day, month-length clamping), `formatSchedule`, and the `dueOccurrence` lead-window decision.
- `src/lib/reminders/reminders.ts` — CRUD over the system page (mirrors `bookmarks.ts`), plus `markMaterialized` (deactivates a fired `once`).
- `src/lib/reminders/materialize.ts` — `materializeDueReminders()`, the client-side reconciler. There is no server cron: it's fired fire-and-forget from a mount effect (`useReminderMaterializer` on the dashboard + `/reminders`), like `pruneEmptyJournalPages`. For each due occurrence it creates a Task via `createTask` using a **deterministic id** (`uuidv5(reminderId:occurrenceKey)`) so cross-device double-fires collapse to one row; `lastMaterializedKey` stops recreation after a task is resolved; a **pending-gate** (skip while the previous task is still `pending`) stops pile-up.
- `src/hooks/use-reminders.ts` — the settle-latched live query + `useReminderMaterializer`. `src/components/reminders/ReminderCard.tsx` is the always-editable inline card (title + inline schedule builder + lead time + priority + tags, autosaving like `QuoteCard`) — no modal; "New reminder" creates a blank card that autofocuses.

`createTask` (`src/lib/tasks/create-task.ts`) takes an optional deterministic `id` for this.

## Data And Write Flow

### Read path

- UI components use `useQuery()` from `@powersync/react`
- Queries read from local SQLite, not directly from Supabase
- This keeps the UI fast and available offline

### Write path

There are three common write patterns:

1. Direct local execute
   - Used when the action should persist immediately
   - Example: some direct inserts/deletes via `db.execute()`

2. Debounced field updates
  - Implemented in `src/lib/shared/debounced-update.ts`
   - Used when rapid repeated edits should merge into one update
  - Important for task editing and notes page metadata updates

3. Single-document editor persistence
   - Implemented in `src/lib/notes/editor/block-persister.ts` (+ `block-diff.ts`)
   - The editor holds one ProseMirror doc; on each edit a debounced flush decomposes it to block rows and writes them in one transaction
   - Before writing, the decomposed rows are diffed against the last-known set so net-zero churn (e.g. edit + undo within the debounce window) writes nothing, and sibling ranks are reused where possible to avoid rank churn
   - A failed flush retains the pending writes for a future retry instead of dropping them; remote row changes for a not-locally-dirty page reconcile back into the open doc with `addToHistory:false`

4. Debounced execute batching
  - Also implemented in `src/lib/shared/debounced-update.ts`
   - Used for insert-like or one-shot writes that should batch and dedupe

Important implementation notes:

- Pending updates are keyed by `table:id`, not just `id`
- `flushAllUpdates()` flushes queued executes before updates
- `tasks`, `pages`, and `blocks` are currently treated as having `updated_at`

## Auth And User Context

- `src/lib/shared/auth.ts` exposes `getCurrentUserId()`
- Many create flows fetch the user id before local writes
- `src/components/AppHeader.tsx` handles logout through Supabase client auth

## App Registry And Visual Identity

- `src/lib/shared/apps.ts` is the central registry for each app's route, name, icon, and accent colors (currently tasks/tracker/notes/quotes/bookmarks/reminders)
- The header, switcher, and mobile FAB shell all rely on this registry; adding an entry surfaces the app in `AppSwitcher` and `AppsFab` automatically (the dashboard bar order lives in `AppsFab`'s `DASHBOARD_ORDER`)
- If a new app is added, start there first
- **Reusing the notes backend:** Quotes, Bookmarks, and Reminders are feature-owned "system pages" (`src/lib/notes/system-pages.ts` — a `kind` tag + deterministic `uuidv5` id, hidden from `/notes`). This is the pattern for any app that wants storage/sync without a schema change; extend `SystemPageKind` and add a thin CRUD lib + hook (mirror `src/lib/quotes/`, `src/lib/bookmarks/`, or `src/lib/reminders/`).

The notes app follows that same pattern, so new shell behavior should extend the shared primitives instead of introducing app-only chrome.

## Motion System

Animation is standardized on the [Motion](https://motion.dev) library (`motion/react`) with one shared vocabulary so the whole app feels consistent (calm and subtle: short durations, one house easing curve, small offsets).

**Tokens (single source of truth):** `src/lib/shared/motion.ts` exports `DURATION` (`fast` 0.12 / `base` 0.2 / `slow` 0.4s), `EASE` (`standard` = the house curve `[0.2, 0.9, 0.2, 1]`, `exit`), `SPRING_SOFT` (micro-interactions), `STAGGER_STEP`, and reusable variants (`fadeSlideUp`, `staggerContainer`/`staggerItem`, `popoverPresence`). It is pure (no `motion/react` import) so it is unit-tested in the node project. The same values are mirrored as CSS custom properties (`--motion-duration-*`, `--motion-ease-*`, `--motion-stagger-step`) in `globals.css`, which the CSS animation utilities (`.animate-fade-slide-in`, `.animate-stagger`, `.transition-smooth`, …) consume.

**Primitives (`src/components/motion/`):** `Reveal` (scroll-triggered `whileInView`), `FadeIn` (mount entrance — the Motion replacement for `.animate-fade-slide-in`), `AnimatedList` + `MotionListItem` (staggered enter/exit lists, replaces `.animate-stagger`; pass `layout={false}` inside CSS `columns` containers where FLIP is unreliable), and `Presence` (enter/exit for hand-rolled popovers). Prefer these over new bespoke animation code.

**Reduced motion:** every primitive gates on `useReducedMotion()` and renders a static element when reduced motion is preferred. `globals.css` also has a global `@media (prefers-reduced-motion: reduce)` block that neutralizes all CSS animations/transitions, so both mechanisms are covered.

**Where it's applied:** dashboard hero (scroll collapse + reveal), task list add/remove/complete (`AnimatePresence` on the tasks masonry + `TaskCard` exit — the DB delete is immediate and the card animates out as it unmounts), subtask and complete-toggle/mood micro-interactions, custom popover exits (`PagePeekPopover`, `DayPopover`), the tracker view tabs (a `layoutId` underline + content crossfade), and skeleton→content fade-in. The Base UI / vaul / cmdk overlays keep their existing CSS `data-open`/`data-closed` enter/exit (converting them would fight the libraries' own mount control), and the notes overview↔editor swap keeps its purpose-built crossfade (an `AnimatePresence` there would remount the Tiptap editor).

**Testing:** DOM tests set `MotionGlobalConfig.skipAnimations = true` and stub `window.matchMedia` in `tests/setup/dom.ts` (wired via `setupFiles` in `vitest.dom.config.ts`) so `AnimatePresence` exits resolve synchronously and `useReducedMotion()` works under jsdom.

## Typography and Display Font

The type system has four roles, all wired through Tailwind v4 tokens in `src/app/globals.css` and loaded via `next/font` in `src/app/layout.tsx`:

- **Body** — Inter (`font-sans`), the global default.
- **Display / heading** — user-selectable (`font-heading` → `--font-heading`): Fraunces (default), Hanken Grotesk, Lora, or Bricolage Grotesque. Applied to wordmarks, page titles, section headers, dialog titles, tracker tabs, and tasks filter pills.
- **Soft / reflective** — Lora (`font-serif`): the weekly journal, plus greetings/mottos and a few empty states.
- **Mono** — Geist Mono (`font-mono`): notes code/query blocks, math inputs, log viewer.

Tracker numerals additionally use `tabular-nums` so digits align in columns.

Display-font switching:

- Each candidate exposes its own next/font CSS var (`--font-fraunces`, `--font-hanken`, `--font-serif` for Lora, `--font-bricolage`), applied to `<body>`.
- `--font-heading` is defined on `body` (not `:root`) and overridden by `body[data-display-font="…"]` rules. It must be on `body` because custom properties resolve `var()` against the declaring element, and the per-font vars live on `<body>`.
- `src/hooks/use-display-font.ts` (`useSyncExternalStore` + `localStorage`) writes the choice; a pre-paint inline script in the layout applies it before first paint to avoid a flash. Default (Fraunces) uses no attribute.
- Config and the `isDisplayFont` guard live in `src/lib/shared/display-font.ts`; the picker UI is the Display font section of `SettingsDialog`.

## PowerSync

- `src/components/powersync-provider.tsx` intentionally waits only for local init before rendering the app
- Cloud sync happens after the app is already usable
- `src/lib/powersync/db.ts` exposes `initLocal()`, `connectCloud()`, `reconnectCloud()`, and `resetLocalDatabase()`

This is one of the most important architectural choices in the codebase:

- local DB ready == UI may render
- cloud connected != required for first paint

## Debugging Entry Points

If you are debugging behavior in this repo, start from the narrowest owning surface:

- navigation or app shell issues: `AppHeader`, `AppSwitcher`, `MobileBottomFabs`, route `loading.tsx`
- tasks editing issues: `TaskCard.tsx`, `TaskMetadataEditor.tsx`, `debounced-update.ts`
- tag/activity dialog issues: `ManageNamedColorItemsDialog.tsx` first, then the wrapper dialog file
- tracker week grid behavior: `tracker/page.tsx`, `TimeGrid.tsx`, `ActivityToolbar.tsx`
- sync/bootstrap issues: `powersync-provider.tsx`, `src/lib/powersync/db.ts`, `SupabaseConnector.ts`

A few repo-specific patterns matter repeatedly:

- Notes edit as one ProseMirror document (`SingleBlockEditor`); a debounced persister writes block rows and reconciles remote PowerSync changes back into the open doc.
- Other views use optimistic local state on top of PowerSync query data.
- Route loading uses real header chrome where possible and skeletonizes only the content below it.
- Mobile dialogs launched from overflow menus are opened outside the dropdown subtree to avoid key input problems.
- The app intentionally favors local responsiveness over immediate cloud confirmation.

## Common Validation Commands

```bash
bun run dev
bun run build
bun run lint
bun run test
bun run test:dom
bunx tsc --noEmit
```

### Testing

Vitest is split between fast node-based suites and a jsdom integration layer for hook-level and DOM-adjacent behavior.

- `tests/notes/` — notes-specific tests
- `tests/tasks/` — task-specific tests
- `tests/tracker/` — tracker-specific tests
- `tests/shared/` — reusable fixtures, builders, and assertions shared across app groups

Primary commands:

- `bun run test` runs the default node-based suites.
- `bun run test:dom` runs the jsdom-backed integration suites.

See [tests/README.md](../tests/README.md) for the current suite map.

### Project Organization

- `src/app/` — App Router routes for launcher, tasks, tracker, notes, quotes, bookmarks, login, share-target, and the metadata API route
- `src/components/` — shared shell UI plus app-specific task, tracker, notes, quotes, bookmarks, and capture components
- `src/lib/shared/`, `src/lib/tasks/`, `src/lib/tracker/`, `src/lib/notes/`, `src/lib/quotes/`, `src/lib/bookmarks/` — helpers grouped by responsibility
- `src/lib/powersync/` — local SQLite schema, database bootstrap, and sync connector
- `tests/` — Vitest suites grouped by app plus shared test helpers

Feature entry points:

- `src/app/tasks/page.tsx` + `src/components/tasks/`
- `src/app/tracker/page.tsx` + `src/components/tracker/`
- `src/app/notes/page.tsx` + `src/components/notes/page/` + `src/components/notes/editor/`
- `src/app/quotes/page.tsx` + `src/components/quotes/` + `src/lib/quotes/`
- `src/app/bookmarks/page.tsx` + `src/components/bookmarks/` + `src/lib/bookmarks/`
- Capture: `src/app/share/page.tsx` + `src/components/capture/` + `src/lib/shared/capture*.ts`

## When To Update This Document

Update this guide when any of the following changes:

- a route gets a major structural rewrite
- shared shell behavior changes
- data flow or sync behavior changes
- a reusable component becomes the main owner of a workflow
- optimistic update or loading-state patterns change