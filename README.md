# Dash.

A personal productivity workspace that works offline and syncs across devices. Tasks, time tracking, notes, quotes, bookmarks, and recurring reminders — all in one place, and capturable from anywhere you can share a link or text.

## What It Does

### Dashboard

The home screen opens calm and centered: a rotating, time-of-day greeting and one search bar that spans both tasks and notes (⌘K anywhere). Beneath it sits a single contextual nudge that changes with the time of day and what you've actually done — the most relevant task in the morning, a reminder to log time if you've tracked nothing in the last couple of hours, your weekly journal in the evening, and a mood check-in at night. Scroll down and the greeting glides up into a slim top bar while the day's essentials fade in — today's tasks with quick-add, hours logged, and this week's journal to write in place. A row of apps sits at the bottom, one tap to each.

### Tasks

Manage your to-do list with subtasks, tags, due dates, and priorities. Filter by state, tag, or priority. Deleted tasks go to trash where they can be restored.

### Tracker

Paint your week on a 7-day × 24-hour grid to log how you spend your time. Rate your mood each day. View yearly heatmaps to spot patterns over months. Weekly widgets break down your activity, sleep, and productivity at a glance. Each week also has its own journal — a serif writing space below the widgets for reflecting on how the week went.

### Notes

A structured editor for thinking and writing. Create pages, nest blocks into outlines, and link between pages with backlinks. Supports markdown shortcuts, slash commands, tables, code blocks with syntax highlighting, and LaTeX math. Attach custom properties to pages (dates, tags, checkboxes, URLs) to build a personal knowledge base.

Pages can have emoji icons, and headings stick while you scroll for easy orientation in long documents. Blocks can be colored for visual emphasis. Date tokens let you insert formatted dates inline via slash commands. Query blocks let you build filtered, sorted views of your pages — like a lightweight database.

Navigate between linked pages with a breadcrumb trail that tracks your path. On desktop, hover a page link to see a peek preview; on mobile, long-press to preview before opening. Paste a URL and it becomes a clickable link with small buttons to open it in your browser or copy it.

### Quotes

Collect lines worth remembering — each with an optional author. Star your favorites. One resurfaces on the dashboard each day (favorites show up more often), and "Show another" cycles through the rest.

### Bookmarks

Save links to read or watch later. Titles are fetched automatically, the site's favicon is shown, and the platform (YouTube, Instagram, X, …) is recognized. Tag them (the same tags as Tasks), mark them read/unread, star them, and search or filter. One unread bookmark resurfaces on the dashboard each day to nudge you to revisit it.

### Reminders

Set up recurring obligations once and let them add themselves. A reminder is a task template — title, link, tags, priority — plus a schedule (one-off, weekly, monthly, or yearly) and a lead time. Dash automatically creates the real task in your Tasks app that many days before each occurrence, so it shows up with everything filled in and a due date. It never stacks up: if the last one is still unfinished, the next won't be created until you clear it.

### Capture

The fastest way in. On Android, install Dash as a PWA and it shows up in your phone's share sheet — share a link or text from any app and a triage screen lets you save it to Bookmarks, Tasks, Notes, or Quotes (a smart default is preselected — links default to Bookmarks). Anywhere else, the dashboard Capture button (or ⌘/Ctrl+Shift+K) opens the same triage from your clipboard. Everything saves locally, so capture works offline.

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
