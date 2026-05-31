# Dash.

A personal productivity workspace that works offline and syncs across devices. Tasks, time tracking, and a full notes editor — all in one place.

## What It Does

### Tasks

Manage your to-do list with subtasks, tags, due dates, and priorities. Filter by state, tag, or priority. Deleted tasks go to trash where they can be restored. On mobile, save tasks directly from your phone's share sheet — share a link or text from any app and it becomes a task.

### Tracker

Paint your week on a 7-day × 24-hour grid to log how you spend your time. Rate your mood each day. View yearly heatmaps to spot patterns over months. Weekly widgets break down your activity, sleep, and productivity at a glance.

### Notes

A structured editor for thinking and writing. Create pages, nest blocks into outlines, and link between pages with backlinks. Supports markdown shortcuts, slash commands, tables, code blocks with syntax highlighting, and LaTeX math. Attach custom properties to pages (dates, tags, checkboxes, URLs) to build a personal knowledge base.

## How It Works

Everything happens locally first. The app reads and writes to a database in your browser, so interactions are instant even without internet. Changes sync to the cloud in the background when you're online, keeping all your devices up to date.

Install it as a PWA from your browser for a native app experience on desktop or mobile.

## Quick Start

```bash
npm install
npm run dev
```

See [SETUP.md](SETUP.md) for backend configuration (Supabase + PowerSync).

## Documentation

- [SETUP.md](SETUP.md) — Environment setup, database provisioning, and deployment
- [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) — Architecture, codebase structure, and implementation reference for contributors
