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
- `Tracker` — time-block logging on a 7-day x 24-hour grid, a user-configurable mood scale (the `moods` table), yearly heatmaps, and weekly widgets
- `Notes` — a local-first outline editor built on pages, blocks, graph edges, and explicitly owned attachments
- `Quotes` — a collection of quotes stored in the notes backend (a hidden `kind: "quote"` system page) with a favorites-weighted daily resurfacing on the dashboard
- `Bookmarks` — saved links stored in the notes backend (a hidden `kind: "bookmark"` system page) with platform detection, server-fetched titles, tags, read/unread, and an unread-weighted daily "revisit"
- `Events` — a log of recurring "things" stored in the notes backend (a hidden `kind: "event"` system page): each event carries a dated occurrence history and an optional schedule + lead time, and a client-side reconciler materializes a real Task before each scheduled occurrence. Occurrences can attach to *any* entity, giving it a timeline (see [Events App Structure](#events-app-structure))

Content enters through **universal capture**: the PWA share target (`/share`) and an in-app quick-capture modal both classify shared links/text and triage them into any app (see [Universal Capture](#universal-capture)). A global ⌘/Ctrl+K **command palette** runs ranked, full-text search across all five entities — including the text inside notes — and jumps between apps (see [Search](#search)). Any entity can **link to any other** via inline `[[ ]]` references that surface as backlinks and in the notes graph (see [Cross-App Links & References](#cross-app-links--references)). Quotes, Bookmarks, and Events reuse the notes `pages`/`blocks` store via the system-page mechanism, so they add no new synced tables (search maintains a local-only index, never synced).

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
  - Hosts `SearchIndexProgressBar` — a hairline bar on the header's bottom edge, shown only while the search index is building (see [Search](#search))

- `src/components/AppSwitcher.tsx`
  - App-to-app switcher used in the shell; its footer also links to the Dashboard and the workspace Graph (`/notes/graph`)
  - Uses the registry in `src/lib/shared/apps.ts`
  - Prefetches other app routes (and the graph) for faster handoff

- `src/components/MobileBottomFabs.tsx`
  - Shared mobile bottom shell used by tasks and tracker
  - Holds the app switcher plus app-specific primary actions

- `src/components/SyncIndicator.tsx`
  - Displays PowerSync connection/upload/download state
  - Used in the header so sync state is always visible
  - Its status popover also surfaces the search index state (`idle`/`building N/M`/`ready`/`unavailable`)

- `src/components/SettingsDialog.tsx`
  - Responsive settings surface (centered dialog on desktop, bottom drawer on mobile)
  - Sections: Account, Appearance (theme), Display font, Notifications (web push), Data (reset local data — confirming closes both dialogs at once, then wipes the local DB + search index and re-syncs in the background)
  - The Display font section uses `useDisplayFont` (see [Typography](#typography-and-display-font))

### Route-level loading behavior

- `src/app/{tasks,tracker,notes,quotes,bookmarks,events}/loading.tsx`
  - Route-level fallback for navigation into each app
  - Each renders the real header shell plus an app-specific skeleton from `src/components/skeletons/*` (shared with the cold-start boot skeleton)

- `src/components/AppBootSkeleton.tsx`
  - Cold-start fallback (shown by `powersync-provider` while the local DB opens) that picks the route-shaped skeleton by pathname (`/tracker/<view>` for the tracker; `/notes/graph` vs `/notes/<id>` vs bare `/notes` for the notes overview/editor/graph), so a refresh boots into the matching skeleton with no blank gap

- `src/components/ui/skeleton.tsx`
  - The one skeleton vocabulary: `Skeleton` (a shimmer bone — the default, for detail pages/editors) and `SkeletonWave` (wraps a long scroll list; direct children breathe in a staggered top-down wave). Animation lives in `globals.css` (`.skeleton*`) and falls back to a static box under `prefers-reduced-motion`; content fades in over the skeleton it replaces (`.skeleton-settle-in`)

Important convention:

- The header is treated as stable app chrome, not data-dependent content.
- Loading UI should generally appear below the real header when possible.
- Every loading skeleton mirrors its real layout (desktop and mobile) so nothing shifts on handoff.

## Directory Map

### Routes

- `src/app/page.tsx` — the welcome dashboard (home/start page; see [Dashboard](#dashboard-structure))
- `src/app/login/page.tsx` — login page
- `src/app/share/page.tsx` — PWA share target → universal capture triage (see [Universal Capture](#universal-capture))
- `src/app/tasks/page.tsx` — tasks dashboard
- `src/app/tracker/page.tsx` + `src/app/tracker/[view]/page.tsx` — path-based tracker (`/tracker/<view>`, `week`/`activity`/`mood`; `/tracker` redirects to `/tracker/week`; see [Tracker App Structure](#tracker-app-structure))
- `src/app/notes/layout.tsx` + `src/app/notes/[[...slug]]/page.tsx` — the notes shell (path-based `/notes`, `/notes/<id>`, `/notes/graph`; see [Notes App Structure](#notes-app-structure))
- `src/app/quotes/page.tsx` — quotes collection
- `src/app/bookmarks/page.tsx` — bookmarks collection
- `src/app/events/page.tsx` + `src/app/events/[id]/page.tsx` — the events grid and single-subject detail (see [Events App Structure](#events-app-structure))
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
- `src/components/journal/*` — the day journal, shared by the dashboard and the tracker: `DailyJournalEntry` (one day's inline editor over a lazily-created per-day page) and `WeekJournalDiary` (the tracker's week-of-days diary). See [Journal](#journal).

### Dashboard components

- `src/components/dashboard/DashboardHero.tsx` — the centered hero (greeting, search bar, contextual action/mood)
- `src/components/dashboard/DashboardGreeting.tsx` — presentational greeting: the date as a small serif eyebrow above the greeting (centered stack)
- `src/components/dashboard/HeroAction.tsx` — the contextual nudge button (opens a task, scrolls to a section, or navigates)
- `src/components/dashboard/MoodPicker.tsx` — a dot per configured mood (from the `moods` table) writing to `daily_ratings` (night hero + shared)
- `src/components/command/CommandPaletteProvider.tsx` — the global ⌘/Ctrl+K command palette, mounted app-wide in the root layout. Runs ranked full-text search across all five entities (via `searchEntities`, see [Search](#search)) — with match highlighting and note-body snippets — and runs Go-to-app (including the workspace Graph) / Quick-capture / New-item commands; built on `SearchPopup`. Filter tokens (`src/lib/search/filter-tokens.ts`, pure + unit-tested) parse the query into at most one `kind:` and one `tag:` filter plus free terms — they **combine** (`kind:task tag:work` = tasks tagged work), but never two kinds or two tags. Each renders as a labeled, colored, removable chip in the input (the tag chip in the tag's own color; both carry a "kind"/"tag" word); the input shows only the terms; backspace-at-start drops the nearest chip. "Filter by kind" / "Filter by tag" completion groups teach and apply them. A `tag:` filter lists every entity carrying that tag across apps — the cross-app "under a tag" view over `entity_tags` (`useEntitiesByTag`) — restricted to the kind when combined, with trailing text narrowing within. Also listens for reference-chip open events (see [Cross-App Links & References](#cross-app-links--references))
- `src/components/command/EntityPopup.tsx` — opens any task/bookmark/quote/event in a blurred modal by reusing that app's own card (looked up live by id; notes deep-link to `/notes/<id>`). Used by the palette, the dashboard hero nudge, and reference-chip clicks
- `src/components/dashboard/TodayTasks.tsx` / `TodayTracking.tsx` — borderless reveal widgets
- `src/components/dashboard/DashboardQuote.tsx` / `DashboardBookmarks.tsx` — the daily "quote of the day" / "revisit" resurfacing cards (a `variant` renders either the compact dashboard tile or the larger hero atop `/quotes` and `/bookmarks`); render nothing until there's content
- `src/components/dashboard/DashboardJournal.tsx` — this week's journal as a Mon–Sun day strip (dots mark days with an entry, future days disabled) over the selected day's inline editor; one page per day (see [Journal](#journal))
- `src/components/dashboard/AppsFab.tsx` — bottom horizontal app strip (single-click nav) over a blurred scrim; a dashboard-specific order (bookmarks, tasks, tracker, notes, quotes) centered on Tracker, with the ends scroll-reachable on narrow screens
- `src/components/capture/QuickCapture.tsx` — in-app capture modal (opened by the dashboard Capture button / ⌘/Ctrl+I); seeds `CaptureTriage` from the clipboard (see [Universal Capture](#universal-capture))

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
- `src/lib/quotes/quotes.ts` / `quotes/daily.ts` — quote CRUD over the `kind:"quote"` system page (content `{ text, author, link, favorite }`; `updateQuote` takes a partial patch), and the favorites-weighted `pickDailyQuote`
- `src/lib/bookmarks/bookmarks.ts` / `bookmarks/daily.ts` / `bookmarks/metadata.ts` / `bookmarks/fetch-metadata.ts` / `bookmarks/ssrf.ts` — bookmark CRUD over the `kind:"bookmark"` system page, the unread-weighted `pickDailyBookmark`, the pure `parseMetadataHtml`, the SSRF host guard shared by both proxy routes, and `refreshBookmarkMetadata` (fills the title and stores the og:image as the bookmark's preview attachment, fetched through the image proxy to dodge CORS; `refreshBookmarkTitle` is the title+image wrapper). Two server routes back it: `src/app/api/bookmark-metadata/route.ts` (returns `{title,description,image,host}`) and `src/app/api/bookmark-image/route.ts` (streams the image bytes)
- `src/lib/events/events.ts` / `events/schedule.ts` / `events/actions.ts` / `events/materialize.ts` — event + occurrence CRUD over the `kind:"event"` system page, the pure recurrence engine, the pure action-vocabulary helpers, and the on-mount reconciler that materializes due scheduled events into Tasks (see [Events App Structure](#events-app-structure))
- `src/lib/tracker/activities.ts` — tracker activity palette and class maps
- `src/lib/tracker/ratings.ts` — `setDailyRating` upsert (insert/update/clear) for the mood picker, shared by the dashboard
- `src/lib/tracker/moods.ts` / `src/hooks/use-moods.ts` — the user-configurable, ordered mood scale (`moods` table): `DEFAULT_MOODS` seed, `moodByValue`/`moodHex`/`moodDotClass`, and `moodRange`/`moodTier` (good/bad-day classification computed from the scale's range). `daily_ratings.score` stores a mood's `value`.
- `src/lib/tracker/day-keys.ts` — UTC-naive/local date-key helpers, incl. `recentNaiveWindow` for the "logged in the last 2h" check
- `src/lib/tracker/year-insights.ts` — pure, DB-free year rollups for the tracker year views: `computeActivityYearInsights` (total hours, monthly totals, and a per-activity breakdown — hours/share, monthly trend, weekday pattern, cadence, peak month and recency — plus a sleep-per-night rollup; future-excluded via a UTC now-gate) and `computeMoodYearInsights` (average + coverage, monthly/weekday mood averages, a per-mood-level breakdown — days/share, monthly & weekday counts, streak, peak month, recency — and a weekly-rhythm summary; local-date gated). Rendered by `src/components/tracker/year-insights.tsx`
- `src/hooks/use-notes.ts` — local SQLite query hooks for note pages and blocks (excludes `properties.kind`-tagged system pages from Notes lists)
- `src/hooks/use-quotes.ts` / `src/hooks/use-bookmarks.ts` / `src/hooks/use-events.ts` — live query hooks reading the quote/bookmark/event blocks off their system page (a "settled" latch keeps the empty state from flashing during the page-id → query swap); `use-events.ts` also serves occurrences, per-subject aggregates, the action vocabulary, subject-label resolution, and `useEventMaterializer`
- `src/lib/links/tokens.ts` / `links.ts` / `resolve.ts` — the cross-app link layer: the `[[label|kind:id]]` token grammar (`parseRefTokens`/`stripRefs`/`formatRefToken`/`refKindAccentVar`), the generic reader/writer over `edges` (`reconcileEntityRefs`/`replaceEdges`/`deleteEntityEdges`, serialized per source id), and the opaque-id → `{kind,label}` resolver. See [Cross-App Links & References](#cross-app-links--references)
- `src/components/links/*` — `EntityRefNode` (shared inline chip Tiptap node), `RefField` (wraps a plain card field as a one-line rich editor hosting chips), `Backlinks` (inline inbound chips, notes rail), `LinkedFrom` (card "N linked" popover: local graph + linking-items list)
- `src/hooks/use-links.ts` / `use-entity-search.ts` — reactive backlinks (`useBacklinks`) and the shared all-entity `[[` search. `useEntitySearch` runs the ranked FTS query when the index is ready and falls back to the in-JS per-app match otherwise (see [Search](#search))
- `src/lib/search/*` + `src/hooks/use-search-index.ts` — the local full-text search layer: `derive-text.ts` (pure per-kind → `{title,body,aux}` derivation), `search-index.ts` (the FTS5 engine — probe, DDL, watermark reconcile, backfill, progress store), `query.ts` (`searchEntities` — the ranked query API for ⌘K + `[[`), `match-query.ts` (pure query parser + fuzzy + highlight helpers), `occurrences.ts` (`searchOccurrences` for the events timeline). `use-search-index.ts` binds the progress store to React. See [Search](#search)
- `src/components/SearchIndexProgressBar.tsx` — the one-time build indicator on the app header (renders nothing when idle)
- `src/lib/storage/*` + `src/hooks/use-attachment-url.ts` / `use-entity-image.ts` — the file-attachment layer. Bytes live in a private Supabase Storage bucket (`attachments`), never in PowerSync — only the `attachments` metadata row syncs. `attachFile(file, {pageId}|{blockId})` caches the bytes locally (`local-blob-store.ts`, OPFS with an IndexedDB fallback) and inserts a `pending` row; `attachment-sync.ts` is a `db.onChange` reconciler (the sole bytes maintainer) that uploads pending rows, resolves a view URL (local cache → download-and-cache), and sweeps Storage objects with no live row — the offline-safe cascade-delete backstop. `paths.ts` holds the pure path/validation/orphan helpers. `deleteEntityAttachments(id, ctx?)` joins an entity's delete fan-out (see `deleteBookmark`, the block persister's DELETE, and `deleteNotePage`). Surfaces: the Notes details rail (`NotesDetailsRail.tsx` — upload, image thumbnails, download, delete) and bookmark preview images (`useEntityImage` in `BookmarkCard.tsx`)
- `src/lib/shared/trash.ts` + `src/hooks/use-trash.ts` / `use-trash-action.ts` + `src/components/toast/ToastProvider.tsx` — the shared soft-delete (trash) layer. Deleting a bookmark/quote/event/note-page/task stamps a reversible marker — `blocks.deleted_at` / `pages.deleted_at`, or `tasks.state='trashed'` — instead of destroying rows; relationships (edges/tags/attachments/occurrences) survive so a restore is lossless. `softDeleteEntity`/`restoreEntity` flip the marker (bumping `updated_at` so the search reconciler catches it) and cascade the occurrence log; `purgeEntity` delegates to the existing hard-delete functions for the real fan-out. Every list/search query gains `deleted_at IS NULL` (the central `useSystemPageBlocks` seam covers bookmarks/quotes/events). `useTrashAction` (via the app-wide `ToastProvider`, mounted in `layout.tsx`) is the delete→undo-toast entry point every card calls; `useTrashedItems` feeds the global `/trash` page (Restore / Delete forever / Empty trash), reachable from the AppSwitcher footer + ⌘K palette like Graph. Note *blocks* are excluded (the editor owns them); trash covers note *pages*.
- `src/hooks/use-derived-state.ts` — `useDerivedState(source, transform)`: local editable state that re-syncs from a prop via adjust-during-render (the endorsed alternative to a setState-in-effect), used by `TaskCard`
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
- `src/lib/notes/notes.ts` — note page CRUD, metadata writes, attachment upserts, edge reconciliation, and the `ensureSystemPage` helper (feature-owned pages; `createStarterBlock: false` for lazy-created surfaces like the journal)
- `src/lib/notes/system-pages.ts` — deterministic ids for "system pages": notes pages tagged with `properties.kind` (e.g. `journal`) and located by `uuidv5(kind:userId:key)`, so features can reuse the notes store while staying hidden from `/notes`
- `src/lib/notes/page-nav-stack.ts` — pure push/pop/popTo logic for the page breadcrumb stack
- `src/lib/notes/properties.ts` — CRUD operations for property definitions and custom property value parsing

### PowerSync integration

- `src/lib/powersync/AppSchema.ts` — local schema definition
- `src/lib/powersync/db.ts` — database instance and lifecycle: `initLocal` (opens local SQLite, then ensures + primes the search index), `connectCloud`, `reconnectCloud`, `resetLocalDatabase` (drops the search index so it rebuilds)
- `src/lib/powersync/SupabaseConnector.ts` — sync connector implementation

### Tests

- `tests/notes/*` — notes-specific Vitest suites
- `tests/tasks/*` — task-specific Vitest suites
- `tests/tracker/*` — tracker-specific Vitest suites
- `tests/quotes/*` / `tests/bookmarks/*` — quotes/bookmarks daily-pick + metadata suites
- `tests/events/*` — the recurrence-engine (`schedule.ts`), action-vocabulary (`actions.ts`), and event/occurrence parse (`events.ts`) suites
- `tests/links/*` — the cross-app reference token grammar (`tokens.ts`)
- `tests/search/*` — search text derivation (`derive-text.ts`) and the pure query grammar / fuzzy / highlight helpers (`match-query.ts`)
- `tests/shared/*` — shared fixtures, builders, and assertions reused across app groups (incl. the capture classifier)
- `tests/README.md` — current suite map and short descriptions of what each test file covers

### Notes App Structure

Routing (path-based, shell in the layout):

- URLs are path-based: `/notes` (overview), `/notes/<id>` (a note), `/notes/graph` (the graph) — no `?page=`/`?view=` query params or fallbacks. The route is an optional catch-all `src/app/notes/[[...slug]]/page.tsx`, but the page itself returns `null`.
- The whole workspace UI lives in `src/components/notes/page/NotesWorkspace.tsx`, mounted by `src/app/notes/layout.tsx`. Because it sits in the **layout**, it persists across surface changes (overview ↔ note ↔ graph are just param changes) and, crucially, **above the route loading boundary** — so navigating between notes never unmounts and re-skeletons the pages rail. `loading.tsx` returns `null` for the same reason (a full-page skeleton there would flash over the persistent rail); a cold load is covered by `AppBootSkeleton`. `NotesWorkspace` derives its surface from `usePathname()`.
- Two flash fixes ride on this: page cards navigate via the in-app transition (`selectPageOnClick` intercepts a plain left-click, letting cmd/ctrl/middle-click still open a new tab), and the details rail keeps its last content during a param swap (page-keyed adjust-during-render snapshot) so it doesn't blink data → skeleton → data.

Responsibilities:

- Registers the notes app in the shared shell and launcher.
- Orchestrates the overview, editor, and graph surfaces from the path (see Routing above).
- Reads pages, blocks, backlinks, attachments, and mentions from local SQLite through `src/hooks/use-notes.ts`.
- Resolves note page tag ids from the `entity_tags` table (batched via `useEntityTags`) through the shared `tags` table.
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
  - One shared React overlay each (not per block): the grip's block menu (convert/color/move/delete), the caret-anchored slash-command menu, the `[[`-triggered reference autocomplete, and the table add/delete row+column controls. `RefMenuLayer` searches **all entities** and inserts an `entityRef` chip node bound to the target id; it's portalled to `<body>`, fixed-positioned at the caret, viewport-clamped, and re-anchors on scroll (see [Cross-App Links & References](#cross-app-links--references)). Shared with the cards' `RefField`.

- `src/components/notes/MarkdownCheatsheetDialog.tsx`
  - Reference popup (opened from the editor's three-dot "Shortcuts" item) listing every markdown/keyboard shortcut, grouped and color-accented.

- `src/components/notes/graph/*` + `src/hooks/use-note-graph.ts` + `src/lib/notes/graph.ts`
  - A universal, Obsidian-style graph of the vault: **one node per item** — every note page plus any task/bookmark/quote/event that participates in a link (see [Cross-App Links & References](#cross-app-links--references)). `graph.ts` holds pure helpers (`buildGraph` builds an undirected, deduped, weighted node graph from resolved reference edges; `neighborhood` BFS; `isOrphan`); `use-note-graph.ts` is the reactive model — it resolves both endpoints of each `edges` row (`type IN ('ref','page_ref')`) to a node, colours notes by their first tag and other kinds by the app accent, surfaces linked items as nodes, and **collapses every unlinked item into one per-kind cluster** (`GraphCluster { kind, count, nodes }`) so an isolated node never litters the canvas — a cluster expands to its members when opened. `useForceSimulation` wraps `d3-force`; `NotesGraphCanvas` renders SVG with pan/zoom, **fit-to-all on load** (no minimum zoom, so a sparse graph still fills the viewport; re-fits when late clusters arrive), node drag-to-pin, hover-neighbourhood highlight, and a Lucide kind-icon inside each node (the icon carries the accent colour; the node body follows the theme); clicking a node opens its target — notes open the page, other kinds open `EntityPopup`. `NotesGraphView` adds the controls (search, hide-orphans, tag filter, neighbour depth, a **show-other-apps** toggle, and an in-graph "← Overview" exit since the graph hides the app chrome). Because it maps every app, the graph is reached app-wide — the ⌘K palette ("Graph" under Go to) and the app switcher's footer both open `/notes/graph`, not only routes inside Notes. `LocalGraphPanel` reuses the engine (mini variant, one uniform node size) in the details rail's Connections tab and behind each card's `LinkedFrom` popover. Node size scales with degree in the full graph only; the mini graph is uniform. Only resolved links exist as edges, so links to not-yet-created pages don't appear.

- `src/components/notes/editor/TaskLineNode.ts` / `QueryBlockNode.tsx`
  - `taskLine` is a single checkbox line — each checklist item is its OWN block (`blockType: "task"`), no `taskList` wrapper. `queryBlock` is an atom NodeView rendering the existing `QueryBlockView`.

- `src/components/notes/NoteBlockEditorExtensions.ts` / `NoteBlockEditorMath.ts` / `NoteBlockEditorSlash.ts` / `NoteBlockEditorCode.ts` / `NoteBlockEditorColor.ts`
  - Shared Tiptap building blocks reused by the single-document schema: reference decorations (`[[page refs]]` + `{date}` tokens) / date auto-format / markdown links / arrow replacement; `LinkOpenControls` (a plugin whose `view` manages one floating toolbar anchored to a link on hover/tap — open, copy, edit URL + text, unlink — since links don't open on click; fixed-positioned so it never reflows text and leaves no inline icons); markdown-typing input rules that create blocks — divider (`---`), image (`![alt](url)`), checkbox (`[]`/`[x]`), and block color (`!blue`/`!none`) — alongside the ones each node ships (headings, quote, code, math); inline (`$...$`) and block (`$$...$$`) math with KaTeX NodeViews; the slash command catalog (+ filter/group helpers, including `/math`, `/todo`, `/date`); the code block toolbar; and per-block background colors.

- `src/lib/notes/editor/block-persister.ts`
  - Debounced per-page persister: decomposes the doc to rows, diffs against the last-known set (churn-minimal ranks, net-zero writes, failure retention), reconciles per-block edges, and merges remote row changes back into the open doc with `addToHistory:false`. `flushAllBlockDocumentPersisters()` flushes on `beforeunload`. An optional `deleteWhenEmpty` deletes the whole page when the doc is emptied (the journal uses it so a cleared day leaves nothing behind).
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
- **Date tokens** — typing `{May 2, 2025}` or the date slash commands (`/today`, `/tomorrow`, `/date`) inserts an inline date chip, styled as a link-underline in tracker teal (dates read as time, matching the reference-chip link treatment).
- **Hover grip** — a drag/menu handle appears in the left margin on hover; clicking it opens the block menu.
- **Emoji icons** — pages and property definitions use a Fluent Emoji Flat picker for visual identity.

Conventions:

- Keep `src/components/notes/page/NotesWorkspace.tsx` (mounted by `notes/layout.tsx`) as the route orchestrator and state wiring layer; the `[[...slug]]` page/loading files stay empty.
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
- **Contextual hero action:** `useHeroAction` gathers signals — pending/overdue/due-today tasks (and the most-relevant one), whether time was logged in the last 2h (`recentNaiveWindow`), whether mood was rated today, and whether today's journal page exists — and feeds the pure `chooseHeroAction` picker (`src/lib/dashboard/hero-action.ts`). At night it shows `MoodPicker`; otherwise a single `HeroAction` nudge (most-relevant task → task modal, plan → scroll to `#today-tasks`, track → `/tracker`, journal → scroll to `#journal`).
- **Search:** the hero bar and the collapsed top-bar icon open the global **command palette** (`useCommandPalette()`; also ⌘/Ctrl+K anywhere), which searches all five entities and runs navigation/create/capture commands. Entity hits open in `EntityPopup` (notes deep-link to `/notes/<id>`). See [Cross-App Links & References](#cross-app-links--references) for the shared entity search.
- **Journal:** `DashboardJournal` shows a Mon–Sun day strip over the selected day's inline `DailyJournalEntry` (one page per day; see [Journal](#journal)).
- **Apps:** `AppsFab` is a fixed bottom strip of single-click app links over a blurred scrim; ordered bookmarks/tasks/tracker/notes/quotes and scroll-centered on Tracker so the middle app is reachable on launch.
- **Capture:** a Capture button in the top bar (and ⌘/Ctrl+I) opens `QuickCapture` (see [Universal Capture](#universal-capture)).
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

Routing (path-based, shell in the layout):

- URLs are path segments: `/tracker/week`, `/tracker/activity`, `/tracker/mood`; `/tracker` redirects to `/tracker/week`. The `[view]` page and `loading.tsx` return `null`.
- The whole tracker UI lives in `src/components/tracker/TrackerWorkspace.tsx`, mounted by `src/app/tracker/layout.tsx`. Because it sits in the **layout**, it persists across view changes and **above the route loading boundary**, so switching views never unmounts the shell or flashes a route skeleton. `TrackerWorkspace` reads the view from `usePathname()` and navigates by pushing the sibling path (a `pendingView` render-time guard keeps the tab switch instant). A cold load is covered by `AppBootSkeleton` (view-shaped by pathname). This mirrors the notes layout-hoist pattern.

Responsibilities:

- Loads activity types, time logs, and daily ratings from local SQLite
- Serves three views: `week`, `activity`, and `mood`
- Keeps optimistic in-memory overlays for time log and rating changes
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
  - Year heatmap for tracked activity (a 24h × 365-day canvas, capped ~540px wide). Beside it, an interactive **insights** panel (`ActivityYearInsights`): a total-hours headline with a monthly sparkline, a ranked **activities explorer** (hours · share · bar per activity), and a **sleep-per-night** strip. Clicking any activity or the sleep strip swaps the panel for a drill-down — monthly trend, weekday pattern, cadence stats, and peak/recency — with a back control. On desktop (`lg`) it's a side column centered with the grid; below that a centered floating button opens the same in a dialog. Widgets read from the pure rollups in `src/lib/tracker/year-insights.ts`; loading shape `ActivityYearInsightsSkeleton` is shared by the in-app and cold-boot skeletons.

- `src/components/tracker/YearRatingGrid.tsx`
  - Year calendar heatmap for daily mood ratings. An **"Insights" button** in the header row opens a dialog with the interactive `MoodYearInsights`: an average-mood headline + monthly sparkline (colored by each month's mood), a ranked **mood explorer** (days · share per level), and a **weekly rhythm** strip. Clicking a mood or the rhythm swaps the panel for a drill-down — monthly + weekday charts, cadence, peak/recency (mood) or best/worst day + weekend-vs-weekday (rhythm) — with a back control. Same master→detail pattern as the activity panel; reads from `year-insights.ts`.

- `src/components/tracker/ManageActivitiesDialog.tsx`
  - Thin wrapper around the shared named-color CRUD dialog
  - Each activity carries a `category` (`productive | neutral | rest | sleep`), editable per row, plus inline rename

- `src/components/tracker/widgets/*`
  - Weekly analytics and summaries. Below the full-width grid the Week view is a two-column region on desktop (`lg`): widgets on the left, the journal as a sticky column on the right; it stacks to one column on smaller screens.
  - Widget semantics (productive/passive split, sleep stats) are driven by each activity's `category`, threaded from the page as a name→category map — never inferred from the activity name

- `src/components/journal/WeekJournalDiary.tsx`
  - The Week view's journal, in the right-hand column beside the widgets: the week's days-so-far threaded on a timeline, each a `DailyJournalEntry` (future days and entirely-future weeks are hidden). See [Journal](#journal).

Tracker loading model:

- `src/app/tracker/loading.tsx` returns `null` (the workspace lives above the boundary and shows its own view-scoped skeletons); cold loads use `AppBootSkeleton`.
- Within the workspace, `loadingActivities || loadingLogs` shows `WeekViewSkeleton` for the week view body.
- The shared header remains real chrome during loading.

## Journal

One journal per day, shared by the dashboard and the tracker Week view.

- **Storage:** each day is one notes system page (`kind:"journal"`, key = the `yyyy-MM-dd` day (`journalDayKey`), id via `systemPageId`), edited with `SingleBlockEditor`. Journal pages are hidden from `/notes` and the graph (the `kind IS NULL` filter).
- **Lazy, self-cleaning:** `ensurePage` materializes the page on the first keystroke and `deleteWhenEmpty` deletes it again if the day is cleared, so browsing or emptying days persists nothing.
- **`DailyJournalEntry`** — one day's inline editor. The caller passes `hasEntry` from a single batched `useJournalEntryDays` query for the whole week, so a day with content mounts straight to the editor (over a compact loader) and an empty day shows a quiet prompt until opened — no per-entry query and no placeholder→skeleton→content flip. The entrance animation is off here because day-switching remounts the editor constantly.
- **Surfaces:** `DashboardJournal` (a Mon–Sun day strip over the selected day) and `WeekJournalDiary` (the tracker's week-of-days diary). Both live in `src/components/journal/`; `src/hooks/use-journal.ts` holds `journalDayKey` and `useJournalEntryDays`.

## Shared Named-Color CRUD Pattern

The tag, activity, and mood management dialogs share one reusable primitive:

- `src/components/ManageNamedColorItemsDialog.tsx`

This component owns:

- dialog open behavior
- create input and color picker UI
- optimistic create overlays
- optimistic color updates
- optional inline rename (opt-in via `onRename` — used by moods and activities; tags omit it)
- optional per-row category dropdown (opt-in via `categoryOptions`/`onUpdateCategory` — used by activities)
- delete confirmation dialog before removing items
- reconciliation between optimistic and persisted rows

It is wrapped by:

- `src/components/tasks/ManageTagsDialog.tsx`
- `src/components/tracker/ManageActivitiesDialog.tsx`
- `src/components/tracker/ManageMoodsDialog.tsx`

The shared tag selection UI lives separately in:

- `src/components/tags/TagSelector.tsx`
- `src/components/tags/TagPillStrip.tsx`

Tasks and notes both resolve against the same `public.tags` rows, so changes to tag names or colors should be reflected consistently across both apps.

If one of these dialogs breaks, start with the shared component first.

## Universal Capture

Two entry points, one triage component:

- **PWA share target** — `src/app/share/page.tsx`. The manifest (`public/manifest.json`) declares a GET `share_target` at `/share`; on an installed Android PWA a shared link/text lands here. (iOS Safari doesn't support Web Share Target — deferred.)
- **In-app quick capture** — `src/components/capture/QuickCapture.tsx`, opened from the dashboard Capture button or ⌘/Ctrl+I; seeds the triage from the clipboard.

Both render `src/components/capture/CaptureTriage.tsx`, which:

- classifies the payload with `classifyShare` (`src/lib/shared/capture.ts`) → a smart default target (URL → Bookmark with platform detected, short text → Quote, prose → Note)
- holds one shared field model (title / text / url), so fetched metadata and edits persist when the user switches the target chip; a URL auto-fetches its title/description via `/api/bookmark-metadata` into the active fields
- saves through `saveCapture` (`src/lib/shared/capture-actions.ts`) → `createBookmark` / `createQuote` / `createTask` / `createNoteFromText`, then shows an inline "Saved to X" state (no toast system)

All writes are local (offline-safe). The proxy (`src/proxy.ts`) preserves `/share?...` across a login round-trip via `sanitizeNextPath`.

## Cross-App Links & References

Any entity can reference any other (task→bookmark, quote→note, event→note, note→anything, …) via inline `[[ ]]` chips. Everything is stored in the generic `edges` table (the same table that backs notes' `[[wikilinks]]`), so there are no new tables.

- **Token grammar** — `src/lib/links/tokens.ts`. `[[label|kind:id]]` is an id-bound link to any entity (what new inserts produce); a bare `[[label]]` resolves by page title. `stripRefs(text)` returns the label-only text for any surface that shows the raw string without an editor (command palette, dashboard, lists, graph labels). `parseRefSegments` splits a string into text runs + id-bound chips for the editor.
- **Edges** — `source_block_id → target_id`, both an entity id that may be a block id, a task id, or a page id (all uuids, globally unique). `type` is `page_ref` (note wikilink) or `ref` (id-bound); reference-consuming queries match `type IN ('ref','page_ref')`. `source_block_id` has no foreign key (a source may be a task, not only a block), so edge cleanup on entity delete is handled in app code (`deleteEntityEdges`, the block persister, `deleteNotePage`). Indexes on `edges(source_block_id)`, `edges(target_id)`, and `blocks(page_id, type)` keep linking and backlinks flat.
- **Reconcile (single writer)** — `reconcileEntityRefs(sourceId, texts)` in `src/lib/links/links.ts` extracts tokens from the text a source owns and diff-writes its edge rows to match (deterministic uuidv5 ids; **serialized per source id** to avoid concurrent-insert races). Every source has exactly one reconcile call site, so nothing clobbers. **Tasks roll up to the root task**: a subtask's references attach to the parent task's id, as the deduped union of the root title + all subtask titles — a task + its subtasks is one graph node.
- **Authoring** — `src/components/links/`. `EntityRefNode` is a shared inline atomic Tiptap node rendered as a chip (Lucide kind-icon + accent link-underlined label; click dispatches an open event). `RefField` wraps a plain card field as a one-line rich editor hosting those chips — string in / string out, so the card keeps its own (debounced) column persistence; supports `singleLine`, `clearOnCommit`, `maxLength`, `readOnly`. Used by the notes editor and the four block-app cards (task title + subtasks + the add-subtask composer, bookmark note, quote text, event title). The `[[` picker is `RefMenuLayer` backed by `useEntitySearch`.
- **Backlinks** — `src/hooks/use-links.ts` + `src/lib/links/resolve.ts`. `useBacklinks(id)` resolves every inbound edge to `{kind,id,label}` (deduped; note sources collapse block→page). `LinkedFrom` (the four cards) is a compact "N linked" popover with the local Connections graph + the linking-items list; `Backlinks` (notes rail) shows cross-app inbound chips inline while the rail's rich list keeps note→note. A reference chip anywhere dispatches an open event that `CommandPaletteProvider` handles (notes navigate; the four open in `EntityPopup`).
- **Graph** — the notes graph is a universal one-node-per-item graph over these edges; see the notes graph module above.
- **Tags** — a second synced association table, `entity_tags(entity_id, entity_kind, tag_id)`, is the single source of truth for tag membership across all four tagged apps (the `tags` table holds only definitions). `src/lib/tags/entity-tags.ts` mirrors the edges writer: `setEntityTags(entityId, kind, tagIds)` diff-writes membership (deterministic uuidv5 ids, serialized per entity) and bumps the owning row's `updated_at` so a tag change rides the search reconciler's watermark; `deleteEntityTags`/`deleteTagLinks` clean up on entity/tag delete. `useEntityTags(ids)` (batched) reads membership for display; `useEntitiesByTag(tagId)` backs the ⌘K `tag:` view. Filters are indexed joins (`… id IN (SELECT entity_id FROM entity_tags WHERE tag_id = ?)`); FTS aux carries resolved tag **names**. Tags live only here — no task, bookmark, event, or note row carries a tag field of its own.

## Search

Full-text search over every app is backed by **SQLite FTS5**, run in the same browser-local database. The whole layer lives in `src/lib/search/` with the React binding in `src/hooks/use-search-index.ts`.

**The index is a local-only, disposable cache.** It is never synced (not part of `AppSchema`), and `resetLocalDatabase` or a browser eviction wipes it. Every path tolerates it being empty or missing and rebuilds — so eviction, a schema bump, and a reset are all non-events. Three local tables:

- `search_index` (fts5) — one row per navigable entity: `kind, entity_id` (UNINDEXED) + `title, body, aux`. Covers note pages, top-level tasks, and bookmark/quote/event blocks. bm25 weights title ≫ body > aux.
- `occurrence_index` (fts5) — one row per logged occurrence: `occ_id, thing_id, thing_kind, at` (UNINDEXED) + `action, place, note`. Feeds the events Timeline only — occurrences stay out of ⌘K.
- `search_meta` — `schema_version`, `watermark`, `backfill_done`, `backfill_cursor`.

**One reconciler is the sole maintainer.** `search-index.ts` registers a single `db.onChangeWithCallback({tables:['pages','blocks','tasks']})` watcher; there are no per-write or per-delete hooks. It fires for both local edits and synced remote writes, so a watermark-based pass (upsert rows whose `updated_at` moved past the stored watermark, then prune orphans by anti-join against the live source rows) covers inserts, updates, and deletes from any source. Note bodies can't be extracted in SQL (nested ProseMirror JSON), so `derive-text.ts` derives them in JS via `extractNoteText`; every note edit bumps the owning page's `updated_at` (`touchNotePage` / the persister's `onPersisted`), so a page-level watermark catches block adds/edits/deletes. Writes are serialized through one promise chain.

**Lifecycle** (`src/lib/powersync/db.ts`): `initLocal` calls `ensureSearchIndex()` (probe FTS5, create tables, read build state; on a `schema_version` mismatch it clears and forces a rebuild) then `primeSearchIndexLocal()` — which starts the reconciler and **builds immediately on local open** (a returning user's data is already local from prior syncs, so a wiped or version-bumped index rebuilds on the next launch with no manual reset). A first-ever user starts empty; the reconciler indexes rows as the first sync streams them in, and `buildSearchIndexAfterSync()` is the backstop. The backfill is batched, resumable (a persisted cursor), and reports progress through a small external store — surfaced as `SearchIndexProgressBar` on the header and a line in the sync popover.

**Query API** (`query.ts` + the pure `match-query.ts`): `searchEntities(query, {kinds?, limit?, perKind?, excludeId?})` parses the input into a `kind:` filter, `"exact phrases"`, and free terms (`parseSearchQuery`), builds an FTS MATCH (`buildMatch` — phrases locked to adjacency, terms prefix-matched), ranks by bm25, and returns hits with `highlight()`/`snippet()` markers. A 1-char query falls back to `LIKE`; when exact/prefix finds nothing, a bounded edit-distance pass (`fuzzyMatchTitle`) recovers typos. Highlight markers are private-use sentinels that surfaces split with `toHighlightSegments` (or strip with `stripHighlight`). Everything in `match-query.ts` is pure and unit-tested (`tests/search/`). `occurrences.ts` mirrors this for the timeline (`searchOccurrences`), matching text via FTS and subject-name matches via ids the caller resolves.

**Surfaces & fallback:** ⌘K (`CommandPaletteProvider`) and the `[[` picker (`useEntitySearch`) both call `searchEntities`; the events Timeline calls `searchOccurrences`. Each keeps its prior in-JS substring match as a live fallback and switches to FTS once `isSearchIndexReady()` (exposed to React as `useSearchIndexReady()`) — so search always works, including before the first build and if FTS5 were unavailable.

## Quotes App Structure

Route: `src/app/quotes/page.tsx`. Quotes are `type:"quote"` blocks on one hidden system page (`kind:"quote"`, key `"library"`) — no schema change; `content` is `{ text, author, link, favorite }`. `src/lib/quotes/quotes.ts` is the CRUD layer (`updateQuote` takes a partial patch), `src/hooks/use-quotes.ts` the live query, `QuoteCard` the editable card (masonry list), and `DashboardQuote` the favorites-weighted daily "quote of the day" (dashboard tile + `variant="hero"` atop `/quotes`). The optional source `link` renders as a `TaskLink` chip at the end of the attribution line (reused from Tasks), links out from the daily quote's `Attribution`, is searchable via the quote's aux (url + host), and is prefilled from a captured URL.

## Bookmarks App Structure

Route: `src/app/bookmarks/page.tsx`. Bookmarks are `type:"bookmark"` blocks on one hidden system page (`kind:"bookmark"`, key `"library"`). `src/lib/bookmarks/bookmarks.ts` is the CRUD layer (content JSON holds `url/title/note/favorite/unread/addedAt`; tag membership lives in the shared `entity_tags` table), `src/hooks/use-bookmarks.ts` the live query, `BookmarkCard` the editable card (favicon, title, note, tags, read/unread, star, per-card refresh), and `DashboardBookmarks` the unread-weighted daily "revisit". Titles are fetched server-side via `/api/bookmark-metadata` (auth-gated + SSRF-guarded); a single omni-field on the page does both search and paste-to-add.

## Events App Structure

Routes: `src/app/events/page.tsx` (the grid) + `src/app/events/[id]/page.tsx` (single-subject detail). The Events app is an **occurrence log** — a dated history of things that happen — that also schedules tasks. An occurrence can attach to *any* entity, not just an event.

Two block types on one hidden system page (`kind:"event"`, key `"log"`, title "Events") — no schema change:

- **Event** (`type:"event"`) — a tracked "thing". Content JSON: `title/link/priority` (tags live in `entity_tags`), an optional `schedule` (`null` = log-only, no task materialization), a `daysBefore` lead time, `defaultPlace`, an optional external subject (`subjectKind`/`subjectId`), `active`, and materialization bookkeeping (`lastMaterializedKey`/`lastTaskId`/`lastLoggedKey`).
- **Occurrence** (`type:"occurrence"`) — one dated record ("Serviced · Jul 25"). Content JSON: `at` (ISO instant), `action` (the free "what happened" string), `place`, `note`, `source` (`manual`/`task`/`schedule`), and its subject (`subjectId` + a denormalized `subjectKind`).

**Occurrences attach to any subject.** The subject id lives in `content.subjectId` (queried via the `OCCURRENCE_SUBJECT_SQL` expression), NOT `parent_block_id` — a subject may be a note page id or task id that the `blocks.parent_block_id` FK would reject, so occurrence rows keep `parent_block_id` NULL. An event with no `subjectId` is its own subject; set one (the "About…" picker) and the event's logs land on that other thing's timeline. Occurrences never write to the `edges` table and `RefKind` has no `occurrence`, so they stay out of backlinks, the graph, and the global ⌘K palette. They are searchable only in the events **Timeline**, through a dedicated local `occurrence_index` (see [Search](#search)).

Files:

- `src/lib/events/events.ts` — event + occurrence CRUD. `createEvent` (blank, log-only; accepts a caller-supplied `id` so navigation can beat the write and no empty card flashes first), `logOccurrence`/`updateOccurrence`/`deleteOccurrence`, `deleteEvent` (cascades the event's own occurrences), and `deleteSubjectOccurrences(subjectId)` — called from each app's delete path so a deleted note/bookmark/quote/task leaves no orphan logs (there is no shared cross-app delete chokepoint). Pure stats helpers (`computeThingStats`/`statsFromAggregate`/`formatDays`) derive last-done, average gap, expected cadence, overdue, and next-due.
- `src/lib/events/schedule.ts` — the pure, DB-free recurrence engine (like `capture.ts`, so tests don't load PowerSync): the `EventSchedule` union (`once`/`weekly`/`monthly`/`yearly`/`interval`), `nextOccurrenceOnOrAfter` (local-calendar, month-length clamping; `interval` is anchored to the last occurrence so "every N days" self-corrects to when the thing actually happened), `formatSchedule`/`describeSchedule`, and the `dueOccurrence` lead-window decision.
- `src/lib/events/actions.ts` — pure, DB-free helpers that keep the free-text `action` from fragmenting: `caseKey` (case/whitespace key → silent-snap + dedup), `stemKey` (inflection key → suggestions only), `editDistance`, `buildActionVocabulary`, and `rankActionMatches` (→ `exact`/`reuse`/`didYouMean` buckets). Stemming and fuzzy matching only *suggest*; the stored surface form is never rewritten, so a bad stem degrades a hint, never corrupts data.
- `src/lib/events/materialize.ts` — `materializeDueEvents()`, the client-side reconciler (no server cron; fired fire-and-forget from `useEventMaterializer` on the dashboard + `/events`; idempotent, StrictMode-safe). Two jobs: **complete → log** (a materialized task now `completed` records an occurrence at its completion time, closing the doing→record loop so cadence stays accurate and an `interval` advances) and **due → materialize** (turn a due schedule into a Task via a **deterministic** `uuidv5(eventId:occurrenceKey)` id, gated by `lastMaterializedKey` + a **pending-gate**). Both log to the *effective subject* = `subjectId ?? eventId`. Also `generateTaskForEvent(eventId)` — the user-fired counterpart: spawn a one-off task from an event on demand (works for log-only events too). It copies title/link/tags/priority (due today) and points the same complete→log slot at the task via a `manual:<taskId>` key, so completing it logs an occurrence of source `"task"` (vs `"schedule"`); the prefix leaves scheduled dedup untouched and never retires a `once` event. Both create paths read tags from `entity_tags`.
- `src/hooks/use-events.ts` — live queries: `useEvents`/`useEvent`, `useOccurrences` (all, or one subject's), `useThingAggregates` (per-subject count/first/last computed in SQLite so the grid never materializes rows in JS), `useActionVocabulary`, `useSubjectLabels` (resolve subject ids → labels per kind for the cross-kind feed), `useAllOccurrenceSubjects` (every distinct subject + kind, so the Timeline resolves labels across all history for name matching), and `useEventMaterializer`.

The **Timeline** view (`src/app/events/page.tsx`) searches the full occurrence history via `searchOccurrences` (`src/lib/search/occurrences.ts`): FTS over action/place/note plus every occurrence of a subject whose name matched, ranked and highlighted. Before the index is ready it falls back to an in-JS substring filter over the loaded window.

Components (`src/components/events/`): `EventCard` (grid card) and `SubjectCard` (a non-event subject in the feed); `OccurrenceLog` (the timeline); `EventLogNow` (the "Log" Compose — opens as a Popover only on a desktop card, a Dialog everywhere else; hosts `ActionInput`); `ActionInput` (typeahead/dedup/fuzzy over the vocabulary — rendered as a positioned `div`, not a popover, so it can nest inside the Compose popover); `EventScheduleDialog` (schedule + lead time + priority + the optional "About…" subject picker); and `EventHeatmap`.

**Logging from other apps:** a "Log an event" affordance lives on the notes details rail (`NotesDetailsRail`) and editor header, and on the bookmark/quote cards and task card — each passes its own `{subjectKind, subjectId}` to `EventLogNow`. The corresponding deletes wire `deleteSubjectOccurrences` into `bookmarks.ts`, `quotes.ts`, and `TaskCard`'s permanent-delete branch.

`createTask` (`src/lib/tasks/create-task.ts`) takes an optional deterministic `id`, used by the materializer.

## Using Events

Every occurrence is one dated record — *what happened, when* — belonging to one subject; from that history Dash derives cadence, next-due, and overdue, and a schedule (if any) turns the same event into a task generator. The generic shapes:

- **Pure log (no schedule).** Make an event "Call Mom" and hit Log each time with the action "Called". Dash shows how often you call and when you last did; no tasks are created (`schedule = null`).
- **Self-correcting chore (`interval`).** "Service the car — every 6 months", lead 7 days. Seven days before it's due a task appears in Tasks; completing it logs a "Serviced" occurrence and the 6-month clock restarts from that date, not from the calendar.
- **Calendar reminder.** "Pay rent — monthly on the 1st", lead 3 days → a task each month on the 28th.
- **Log onto another thing.** On a note (or bookmark/quote/task), hit "Log an event" and type an action → the note grows its own timeline, and the entry also appears in the Events feed under the note's name (subject resolved by `useSubjectLabels`).
- **Scheduled event *about* another thing.** Give an event an "About…" subject (say, the Car note): its reminder tasks still fire, but each completion logs onto the Car note's timeline instead of the event's own (effective subject = `subjectId ?? eventId`).
- **Generate a task on demand.** "Generate task" (event card ⋯ menu, or the detail schedule strip) spawns a one-off task from any event right now — no schedule needed. Completing it logs an occurrence just like a scheduled task, so it doubles as a manual redo when a log or task was lost.

Reusing an action word: typing an `action` autocompletes from words already used; a case/spacing match ("Serviced" vs "serviced") snaps together silently on commit, while a tense or typo ("Servicing", "Servcied") is offered as *did you mean* and never rewrites what you typed.

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

- `src/lib/shared/apps.ts` is the central registry for each app's route, name, icon, and accent (`iconBg`/`iconText`/`hoverText`) — currently tasks/tracker/notes/quotes/bookmarks/events
- It also exports the shared top-bar button primitives `HEADER_ACTION_BASE` / `HEADER_ACTION_NEUTRAL`. Convention: each app header spends its accent on **one** primary action (the "New \<item\>" create button, via `app.accent.hoverText`); every other top-bar button uses `HEADER_ACTION_NEUTRAL` so headers stay calm and consistent across apps
- The header, switcher, and mobile FAB shell all rely on this registry; adding an entry surfaces the app in `AppSwitcher` and `AppsFab` automatically (the dashboard bar order lives in `AppsFab`'s `DASHBOARD_ORDER`)
- If a new app is added, start there first
- **Reusing the notes backend:** Quotes, Bookmarks, and Events are feature-owned "system pages" (`src/lib/notes/system-pages.ts` — a `kind` tag + deterministic `uuidv5` id, hidden from `/notes`). This is the pattern for any app that wants storage/sync without a schema change; extend `SystemPageKind` and add a thin CRUD lib + hook (mirror `src/lib/quotes/`, `src/lib/bookmarks/`, or `src/lib/events/`).

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
- **Soft / reflective** — Lora (`font-serif`): the journal, plus greetings/mottos and a few empty states.
- **Mono** — Geist Mono (`font-mono`): notes code/query blocks, math inputs, log viewer.

Tracker numerals additionally use `tabular-nums` so digits align in columns.

Display-font switching:

- Each candidate exposes its own next/font CSS var (`--font-fraunces`, `--font-hanken`, `--font-serif` for Lora, `--font-bricolage`), applied to `<body>`.
- `--font-heading` is defined on `body` (not `:root`) and overridden by `body[data-display-font="…"]` rules. It must be on `body` because custom properties resolve `var()` against the declaring element, and the per-font vars live on `<body>`.
- `src/hooks/use-display-font.ts` (`useSyncExternalStore` + `localStorage`) writes the choice; a pre-paint inline script in the layout applies it before first paint to avoid a flash. Default (Fraunces) uses no attribute.
- Config and the `isDisplayFont` guard live in `src/lib/shared/display-font.ts`; the picker UI is the Display font section of `SettingsDialog`.

## PowerSync

- `src/components/powersync-provider.tsx` intentionally waits only for local init before rendering the app (and requests persistent storage via `navigator.storage.persist()` so the local DB + search index resist eviction)
- Cloud sync happens after the app is already usable
- `src/lib/powersync/db.ts` exposes `initLocal()`, `connectCloud()`, `reconnectCloud()`, and `resetLocalDatabase()`; `initLocal` also opens the local search index and builds it if needed (see [Search](#search))

This is one of the most important architectural choices in the codebase:

- local DB ready == UI may render
- cloud connected != required for first paint

## Debugging Entry Points

If you are debugging behavior in this repo, start from the narrowest owning surface:

- navigation or app shell issues: `AppHeader`, `AppSwitcher`, `MobileBottomFabs`, route `loading.tsx`
- tasks editing issues: `TaskCard.tsx`, `TaskMetadataEditor.tsx`, `debounced-update.ts`
- tag/activity dialog issues: `ManageNamedColorItemsDialog.tsx` first, then the wrapper dialog file
- tracker week grid behavior: `TrackerWorkspace.tsx`, `TimeGrid.tsx`, `ActivityToolbar.tsx`
- sync/bootstrap issues: `powersync-provider.tsx`, `src/lib/powersync/db.ts`, `SupabaseConnector.ts`
- links / backlinks / references (`[[ ]]`, chips, graph nodes): `src/lib/links/*`, `src/components/links/*`, `RefMenuLayer.tsx`, `use-note-graph.ts` (see [Cross-App Links & References](#cross-app-links--references))
- command palette / global search / ⌘K: `src/components/command/CommandPaletteProvider.tsx` (UI), `src/lib/search/*` (index + query; see [Search](#search))
- search index not building / stale results: `src/lib/search/search-index.ts` and its wiring in `src/lib/powersync/db.ts`

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
- `tests/search/` — search text derivation + the pure query/fuzzy/highlight helpers
- `tests/shared/` — reusable fixtures, builders, and assertions shared across app groups

Primary commands:

- `bun run test` runs the default node-based suites.
- `bun run test:dom` runs the jsdom-backed integration suites.

See [tests/README.md](../tests/README.md) for the current suite map.

### Project Organization

- `src/app/` — App Router routes for launcher, tasks, tracker, notes, quotes, bookmarks, events, login, share-target, and the metadata API route
- `src/components/` — shared shell UI plus app-specific task, tracker, notes, quotes, bookmarks, events, and capture components
- `src/lib/shared/`, `src/lib/tasks/`, `src/lib/tracker/`, `src/lib/notes/`, `src/lib/quotes/`, `src/lib/bookmarks/`, `src/lib/events/` — helpers grouped by responsibility
- `src/lib/powersync/` — local SQLite schema, database bootstrap, and sync connector
- `tests/` — Vitest suites grouped by app plus shared test helpers

Feature entry points:

- `src/app/tasks/page.tsx` + `src/components/tasks/`
- `src/app/tracker/layout.tsx` + `src/app/tracker/[view]/` + `src/components/tracker/`
- `src/app/notes/layout.tsx` + `src/app/notes/[[...slug]]/` + `src/components/notes/page/` + `src/components/notes/editor/`
- `src/app/quotes/page.tsx` + `src/components/quotes/` + `src/lib/quotes/`
- `src/app/bookmarks/page.tsx` + `src/components/bookmarks/` + `src/lib/bookmarks/`
- `src/app/events/` + `src/components/events/` + `src/lib/events/`
- Capture: `src/app/share/page.tsx` + `src/components/capture/` + `src/lib/shared/capture*.ts`

## When To Update This Document

Update this guide when any of the following changes:

- a route gets a major structural rewrite
- shared shell behavior changes
- data flow or sync behavior changes
- a reusable component becomes the main owner of a workflow
- optimistic update or loading-state patterns change