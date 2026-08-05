# Dash.

A personal productivity workspace that works offline and syncs across devices. Tasks, time tracking, notes, quotes, bookmarks, and events — all in one place, and capturable from anywhere you can share a link or text.

## What It Does

### Dashboard

The home screen opens calm and centered: a time-of-day greeting over a single search bar that opens a command palette across everything (⌘K anywhere) — every task, note, bookmark, quote, and event, plus jump-to-app and quick-create commands. Search reads full text, including the words inside your notes, ranks the best matches first, and shrugs off a small typo; narrow to one app with `kind:note` or gather a label with `tag:reading`, and it all works offline. Below it, a single nudge shifts with the time of day and what you've done — a key task in the morning, a reminder to log time, the day's journal in the evening, a mood check-in at night. Scroll down and the greeting slides into a slim top bar as the day's essentials fade in: today's tasks with quick-add, hours logged, and a week strip for the journal. A row of apps sits at the bottom.

### Tasks

Manage your to-do list with subtasks, tags, due dates, and priorities. Filter by state, tag, or priority. Deleted tasks go to trash where they can be restored.

### Tracker

Paint your week on a 7-day × 24-hour grid to log how you spend your time. Rate your mood each day. View yearly heatmaps to spot patterns over months. Weekly widgets break down your activity, sleep, and productivity at a glance. Below the widgets, each day of the week gets its own journal entry — a serif writing space to reflect day by day.

### Notes

A structured editor for thinking and writing. Create pages, nest blocks into outlines, and write with markdown shortcuts, slash commands, tables, code blocks with syntax highlighting, and LaTeX math. Attach custom properties to pages (dates, tags, checkboxes, URLs), and build filtered, sorted query-block views over them — a lightweight database. Attach files too — add images or documents to a page and they're stored with it, available offline and across your devices. Hover a page link for a peek preview, and a breadcrumb trail tracks your path through linked pages.

Linking isn't limited to notes. Type `[[` in any item — a task (or subtask), bookmark, quote, or event — to link it to any other. Each link shows up as a backlink on the other side, and every linked item becomes a node in the graph, so the graph maps your whole workspace, not just your notes.

### Quotes

Collect lines worth remembering — each with an optional author. Star your favorites. One resurfaces on the dashboard each day (favorites show up more often), and "Show another" cycles through the rest.

### Bookmarks

Save links to read or watch later. Titles and a preview image are fetched automatically, the site's favicon is shown, and the platform (YouTube, Instagram, X, …) is recognized. Tag them (the same tags as Tasks), mark them read/unread, star them, and search or filter. One unread bookmark resurfaces on the dashboard each day to nudge you to revisit it.

### Events

Keep track of the recurring things in your life — and everything that happens to them. An event is anything you want a history for: a car that needs servicing, a plant to water, a friend you mean to call. Log what happened and when — with an optional word for the action ("Serviced", "Watered", "Called") that autocompletes from words you've used before — and Dash works out how often it usually happens, when it's due next, and whether it's overdue. A heatmap shows the rhythm at a glance.

Add a schedule (one-off, weekly, monthly, yearly, or every N days) and an event doubles as a reminder: Dash creates a real task in your Tasks app a set number of days before each one is due, and logs the event as done when you complete that task. Leave the schedule off and it stays a pure log. It never stacks up — if the last task is still unfinished, the next won't be created until you clear it.

Events don't have to stand alone. Hit "Log an event" on a note, bookmark, quote, or task and that thing grows its own timeline — every log shows both on the thing itself and in the shared Events feed, tagged with what it belongs to. The Timeline view searches your whole history — by action, place, note, or the name of the thing — with matches highlighted.

### Capture

The fastest way in. On Android, install Dash as a PWA and it shows up in your phone's share sheet — share a link or text from any app and a triage screen lets you save it to Bookmarks, Tasks, Notes, or Quotes (a smart default is preselected — links default to Bookmarks). Anywhere else, the dashboard Capture button (or ⌘/Ctrl+I) opens the same triage from your clipboard. Everything saves locally, so capture works offline.

## How It Works

Everything happens locally first. The app reads and writes to a database in your browser, so interactions are instant even without internet. Changes sync to the cloud in the background when you're online, keeping all your devices up to date.

Install it as a PWA from your browser for a native app experience on desktop or mobile.

In Settings you can switch between light and dark themes and choose the app's display typeface (Fraunces, Hanken Grotesk, Lora, or Bricolage Grotesque).

## Quick Start

```bash
bun install
bun run dev
```

See [SETUP.md](SETUP.md) for backend configuration (Supabase + PowerSync).

## Documentation

- [SETUP.md](SETUP.md) — Environment setup, database provisioning, and deployment
- [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) — Architecture, codebase structure, and implementation reference for contributors
