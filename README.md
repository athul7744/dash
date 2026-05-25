# Dash.

An offline-first productivity workspace with **Tasks**, **Tracker**, and **Notes** under one shell. It works offline, keeps local interactions responsive, and syncs to the cloud in the background when connectivity returns.

## Docs

- [SETUP.md](SETUP.md) — environment setup, Supabase, PowerSync, and deployment
- [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) — architecture, app structure, component map, and implementation notes for future contributors or coding agents

## Features

**Tasks** — Offline-first task manager with subtasks, shared tags, due dates, priorities, smart filters, trash and restore, responsive masonry layout, and direct save from the system share sheet.

**Tracker** — 7-day × 24-hour paint grid for logging time blocks, inline daily mood ratings, yearly heatmaps, weekly widgets, and mobile-friendly navigation with shared bottom FAB controls.

**Notes** — Local-first outline editor with pages, nested blocks, shared tags, backlinks, and owned attachments. Supports inline references, mdast-backed markdown paste, markdown-style transforms, slash commands, block context menu (move, indent/outdent, type conversion), table toolbar, LaTeX math (inline `$...$` and block `$$...$$` via KaTeX), and per-level heading/HR styling.

**Week Widgets** — Activity breakdown donut chart, mood insights with sleep correlation, daily stacked bars, sleep stats (avg/range/per-night chart), and productivity ratio bar.

**General** — Installable PWA, web share target routed through `/share`, cross-device sync via PowerSync ↔ Supabase, sync status indicator, and production-safe logging.

## Tech Stack

Next.js 16 · PowerSync · Supabase · Tailwind CSS v4 · Shadcn/UI · Tiptap 3.22.5 · KaTeX · Vitest · Serwist

## Quick Start

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`, then fill in your Supabase and PowerSync values.

Optional validation:

```bash
npm run lint
npm test
npm run test:dom
npx tsc --noEmit
```

## Testing

Vitest is split between fast node-based suites and a small jsdom integration layer for hook-level behavior.

- `tests/notes/` contains notes-focused tests.
- `tests/tasks/` contains task-focused tests.
- `tests/tracker/` contains tracker-focused tests.
- `tests/shared/` contains reusable fixtures, builders, and assertions shared across app groups.

Primary commands:

- `npm test` runs the default node-based suites.
- `npm run test:dom` runs the jsdom-backed integration suites.

See [tests/README.md](tests/README.md) for the current test suite map and what each suite covers.

## How The Project Is Organized

- `src/app/` contains the App Router routes for launcher, tasks, tracker, notes, login, and share-target flows.
- `src/components/` contains shared shell UI plus app-specific task, tracker, and notes components.
- `src/lib/shared/`, `src/lib/tasks/`, `src/lib/tracker/`, and `src/lib/notes/` group shared and app-owned helpers by responsibility.
- `src/lib/powersync/` contains the local SQLite schema, database bootstrap, and sync connector.
- `tests/` contains Vitest suites grouped by app plus shared test helpers.
- `SETUP.md` contains the SQL you need to create the hosted Supabase schema and PowerSync stream configuration.

Feature entry points:

- `src/app/tasks/page.tsx` with `src/components/tasks/` for task editing, metadata, tags, and loading states.
- `src/app/tracker/page.tsx` with `src/components/tracker/` for the week grid, activity management, yearly views, and widgets.
- `src/app/notes/page.tsx` with `src/components/notes/page/` for route-local notes surfaces, plus `src/components/notes/NoteBlockEditor.tsx` and `src/components/notes/NoteBlockEditorSlash.ts` for block editing behavior.

> For a deeper map of how tasks, tracker, share capture, optimistic updates, route loading, and PowerSync fit together, read [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md).
> For environment setup and deployment, read [SETUP.md](SETUP.md).
