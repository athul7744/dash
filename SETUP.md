# Setup Guide

## Architecture

```mermaid
graph LR
    User([User]) <--> UI[Next.js UI]
    UI <--> SQLite[(Local SQLite)]
    SQLite <--> PS[PowerSync Sync Engine]
    PS <--> SB[(Supabase / Postgres)]

    subgraph Browser
        UI
        SQLite
        PS
    end

    subgraph Cloud
        SB
    end
```

**How it works:**
1. The app reads/writes directly to a local SQLite database (via WASM in the browser)
2. PowerSync streams changes bidirectionally between local SQLite and Supabase Postgres
3. The service worker caches all app assets so the UI and database logic load without internet
4. CRUD uploads are debounced to batch rapid edits into fewer network calls while task, tracker, and notes views keep the UI responsive with optimistic or local-first state

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Note your **Project URL** and **Publishable API Key** from **Settings → API**
3. Run this in the Supabase **SQL Editor**:

```sql
-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT,
  due_date TEXT,
  tags TEXT DEFAULT '[]',
  priority TEXT DEFAULT 'medium',
  link TEXT,
  state TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tags table (shared by tasks and note page metadata)
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'slate',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Time logs table (hourly time tracking blocks)
CREATE TABLE public.time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_name TEXT NOT NULL,
  start_timestamp TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, start_timestamp)
);

-- Activity types table (user-defined activities the tracker logs against)
CREATE TABLE public.activity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'neutral', -- productive | neutral | rest | sleep; drives tracker widget semantics
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- Daily ratings table (one mood per day, stored as the chosen mood's value; see the `moods` table below)
CREATE TABLE public.daily_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating_date DATE NOT NULL,
  score SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, rating_date)
);

-- Moods table (the user-configurable, ordered mood scale). `value` is the
-- ordinal (worst→best) stored in daily_ratings.score.
CREATE TABLE public.moods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, value)
);

-- Notes pages table
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notes blocks table
CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  parent_block_id UUID REFERENCES public.blocks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_rank TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notes graph edges table
CREATE TABLE public.edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_block_id UUID NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  target_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  UNIQUE (source_block_id, target_id, type)
);

-- Notes attachments table
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  block_id UUID REFERENCES public.blocks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  CHECK (
    (page_id IS NOT NULL AND block_id IS NULL)
    OR (page_id IS NULL AND block_id IS NOT NULL)
  )
);

-- Property definitions table (global custom properties for note pages)
CREATE TABLE public.property_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own tasks" ON public.tasks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own tags" ON public.tags
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own time_logs" ON public.time_logs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own activity_types" ON public.activity_types
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own daily_ratings" ON public.daily_ratings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own moods" ON public.moods
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own pages" ON public.pages
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own blocks" ON public.blocks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own edges" ON public.edges
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own attachments" ON public.attachments
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own property_definitions" ON public.property_definitions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_time_logs_user_start ON time_logs (user_id, start_timestamp);
CREATE INDEX idx_pages_user_title ON pages (user_id, title);
CREATE INDEX idx_blocks_page_sort_rank ON blocks (page_id, sort_rank);
CREATE INDEX idx_blocks_parent ON blocks (parent_block_id);
CREATE INDEX idx_edges_target_type ON edges (user_id, target_id, type);
CREATE INDEX idx_attachments_page ON attachments (page_id) WHERE page_id IS NOT NULL;
CREATE INDEX idx_attachments_block ON attachments (block_id) WHERE block_id IS NOT NULL;
CREATE INDEX idx_attachments_user_path ON attachments (user_id, file_path);

-- Table privileges for the browser client. RLS still restricts each user to their own rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.tasks, public.tags, public.time_logs, public.activity_types,
  public.daily_ratings, public.moods, public.pages, public.blocks, public.edges,
  public.attachments, public.property_definitions
TO authenticated;

-- Publication for PowerSync replication
CREATE PUBLICATION powersync FOR TABLE public.tasks, public.tags, public.time_logs, public.activity_types, public.daily_ratings, public.moods, public.pages, public.blocks, public.edges, public.attachments, public.property_definitions;
```

### Push notifications schema (optional)

Only needed for [push notifications](#5-push-notifications). Do not add
`push_subscriptions` to the `powersync` publication or the PowerSync stream queries.

```sql
-- Browser push subscriptions (one row per browser/device)
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions (user_id);

-- Privileges: authenticated (browser client), service_role (Edge Function).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- Helper functions the Edge Function calls via supabase.rpc().
CREATE OR REPLACE FUNCTION public.users_without_recent_logs(hours int DEFAULT 2, tz text DEFAULT 'Asia/Kolkata')
RETURNS TABLE (user_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.time_logs tl
    WHERE tl.user_id = u.id
      -- The tracker grid stores each cell's hour as UTC-naive (row H -> H:00Z), so a
      -- block's wall-clock hour is (start_timestamp AT TIME ZONE 'UTC'). Compare that to
      -- "now" in the user's local wall clock so the window matches what's on the grid.
      AND (tl.start_timestamp AT TIME ZONE 'UTC') >= (now() AT TIME ZONE tz) - make_interval(hours => hours)
      AND (tl.start_timestamp AT TIME ZONE 'UTC') <= (now() AT TIME ZONE tz)
  );
$$;

CREATE OR REPLACE FUNCTION public.pending_tasks_due_today(tz text DEFAULT 'Asia/Kolkata')
RETURNS TABLE (user_id uuid, task_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT t.user_id, COUNT(*) FROM public.tasks t
  WHERE t.state = 'pending'
    AND t.due_date IS NOT NULL AND t.due_date <> ''
    AND (t.due_date::timestamptz AT TIME ZONE tz)::date = (now() AT TIME ZONE tz)::date
  GROUP BY t.user_id;
$$;
```

4. Go to **Authentication → Users → Add User** to create your account

5. **Prevent WAL storage buildup** — cap replication slot WAL retention so a disconnected PowerSync client can't fill the disk. Requires the [Supabase CLI](https://supabase.com/docs/guides/resources/supabase-cli):

   ```bash
   supabase --experimental \
     --project-ref <your-project-ref> \
     postgres-config update --config max_slot_wal_keep_size=1GB

   supabase --experimental \
     --project-ref <your-project-ref> \
     postgres-config update --config max_wal_size=1GB
   ```

## 2. PowerSync

1. Sign up at [powersync.com](https://www.powersync.com/)
2. Create an instance and connect it to your Supabase database
3. Configure sync streams:

```yaml
config:
  edition: 3
streams:
  # Bucket A: Low Churn Metadata (Rarely blocks because data rarely changes)
  user_metadata:
    auto_subscribe: true
    queries:
      - SELECT * FROM tags WHERE tags.user_id = auth.user_id()
      - SELECT * FROM activity_types WHERE activity_types.user_id = auth.user_id()
      - SELECT * FROM daily_ratings WHERE daily_ratings.user_id = auth.user_id()
      - SELECT * FROM moods WHERE moods.user_id = auth.user_id()
      - SELECT * FROM property_definitions WHERE property_definitions.user_id = auth.user_id()

  # Bucket B: High Churn Content (Compacts perfectly with CLEAR because operations churn out)
  user_content:
    auto_subscribe: true
    queries:
      - SELECT * FROM pages WHERE pages.user_id = auth.user_id()
      - SELECT * FROM blocks WHERE blocks.user_id = auth.user_id()
      - SELECT * FROM edges WHERE edges.user_id = auth.user_id()
      - SELECT * FROM attachments WHERE attachments.user_id = auth.user_id()
      - SELECT * FROM tasks WHERE tasks.user_id = auth.user_id()
      - SELECT * FROM time_logs WHERE time_logs.user_id = auth.user_id()
```

4. Note your **PowerSync Instance URL**

This needs to stay aligned with the tables created in the Supabase SQL Editor. If you add or rename synced tables later, update both the publication and the PowerSync stream queries together.

The `tags` table is shared by tasks and notes. Tasks store selected tag ids in `tasks.tags`, while notes store selected tag ids in `pages.properties.tags` alongside other page metadata such as emoji and favorite state.

Attachment ownership is explicit: each attachment belongs to either a page or a block. Use page-owned attachments for page-level assets like cover images, and block-owned attachments for embedded files inside note content.

## 3. Local Development

```bash
bun install
```

Copy `.env.example` to `.env.local` and fill in your values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...your-publishable-key
NEXT_PUBLIC_POWERSYNC_URL=https://your-instance.powersync.journeyapps.com
NEXT_PUBLIC_ENABLE_LOG_VIEW=false
# Optional — only if you enable push notifications (see section 5)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

```bash
bun run dev
bun run build && bun run start
bun run lint
bun run test
bun run test:dom
bunx tsc --noEmit
```

Development notes:

- `bun run dev` and `bun run build` already use the repo's configured Webpack-based Next.js commands.
- The `/share` route is wired as the PWA web share target (universal capture: shared links/text triage into Bookmarks/Tasks/Notes/Quotes), so mobile share-sheet flows can be exercised locally after sign-in. The same triage is reachable in-app via the dashboard Capture button or ⌘/Ctrl+Shift+K.
- Set `NEXT_PUBLIC_ENABLE_LOG_VIEW=true` to expose an in-app viewer for the latest 50 logger entries from the current browser session.

### Test layout

Vitest is split by environment:

- `bun run test` runs the default node-based suites for pure logic and write-path behavior.
- `bun run test:dom` runs the jsdom-backed integration suites used for React hook and DOM-adjacent editor behavior.

- `tests/notes/` holds notes-specific tests.
- `tests/tasks/` holds task-specific tests.
- `tests/tracker/` holds tracker-specific tests.
- `tests/shared/` holds shared fixtures and assertion helpers used across app groups.

See [tests/README.md](tests/README.md) for the current suite-level breakdown.

Use `bun run test` for a one-shot node run, `bun run test:dom` for the jsdom integration layer, and `bun run test:watch` while developing.

### Feature implementation notes

Keep feature structure aligned with the existing ownership split:

- Tasks logic lives in `src/app/tasks/page.tsx`, `src/components/tasks/`, and `src/lib/tasks/`.
- Tracker logic lives in `src/app/tracker/page.tsx`, `src/components/tracker/`, and `src/lib/tracker/`.
- Notes route-local UI lives in `src/components/notes/page/`, while the single-document editor lives in `src/components/notes/editor/` (React) and `src/lib/notes/editor/` (schema, persistence, commands).

For notes specifically, keep `src/app/notes/page.tsx` as the route orchestrator and move reusable route-local sections or hooks into `src/components/notes/page/` before expanding the route file.

If you change notes editing behavior, clipboard parsing, or block-merge semantics, keep the tests aligned with the intended visible-order editing rules and update the permanent project docs once that behavior is finalized.

If you change route wiring or editor behavior, validate with both `bun run lint` and `bunx tsc --noEmit`.

If you update Tiptap or KaTeX packages, keep versions aligned. The repo pins Tiptap packages together so schema extensions resolve consistently. KaTeX CSS is imported in `globals.css`.

## 4. Deploy to Vercel

1. Push to GitHub
2. Import at [vercel.com](https://vercel.com) → **Add New Project**
3. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_POWERSYNC_URL`
4. Deploy

> Set your Supabase **Authentication → URL Configuration → Site URL** to your Vercel URL.

---

## 5. Push Notifications

Optional. Two notifications sent by a Supabase Edge Function. Trigger it on a schedule
with any external scheduler (cron, a hosted automation tool, etc.).

1. **Tracker nudge** — no tracker activity logged in the last 2 hours.
2. **Daily task summary** — pending tasks due today (anchored to `Asia/Kolkata`).

### Setup

1. Run the [Push notifications schema](#push-notifications-schema-optional) SQL block above.

2. Generate a VAPID key pair:

   ```bash
   bunx web-push generate-vapid-keys
   ```

3. Set the **frontend** key (Vercel + local `.env.local`):

   ```env
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=B... (the public key)
   ```

4. Set the **Edge Function** secrets (Supabase project / self-hosted secrets):

   | Secret | Purpose |
   | --- | --- |
   | `VAPID_PUBLIC_KEY` | Public key (same value as the frontend one) |
   | `VAPID_PRIVATE_KEY` | Private key from the generate step |
   | `VAPID_SUBJECT` | Contact URI, e.g. `mailto:you@example.com` (required by web-push) |
   | `SB_SECRET_KEY` | Server-side key that bypasses RLS. Use a **secret key** (`sb_secret_…`) from Dashboard → Project Settings → API Keys. |
   | `PUSH_TRIGGER_SECRET` | Shared bearer secret your scheduler must send |

5. Deploy the function — its source is tracked in the repo at
   [supabase/functions/send-push-notification/index.ts](supabase/functions/send-push-notification/index.ts).
   Deploy with **Verify JWT OFF** — the function uses its own shared-secret auth; with
   JWT verification on, the gateway rejects requests before the function runs.

   ```bash
   supabase functions deploy send-push-notification --no-verify-jwt
   ```

   (If already deployed, toggle **Verify JWT** off on the function's dashboard page.)

### Triggering

Schedule POSTs to the function on your chosen cadence:

```
POST <SUPABASE_URL>/functions/v1/send-push-notification
X-Trigger-Secret: <PUSH_TRIGGER_SECRET>
Content-Type: application/json

{ "type": "tracker-reminder" }   # schedule every 2 hours
{ "type": "daily-tasks" }        # schedule daily at 08:00 Asia/Kolkata
```

No Supabase `Authorization`/`apikey` header is needed — the `X-Trigger-Secret` header is
the only auth. Example:

```bash
curl -L -X POST '<SUPABASE_URL>/functions/v1/send-push-notification' \
  -H 'X-Trigger-Secret: <PUSH_TRIGGER_SECRET>' \
  -H 'Content-Type: application/json' \
  --data '{"type":"daily-tasks"}'
```

Expired/unsubscribed endpoints (HTTP `404`/`410` from the push service) are deleted from
`push_subscriptions` automatically on each send.

---

## Additional Documentation

- [README.md](README.md) — concise product overview and local quick start
- [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) — detailed project structure, app/component map, data flow, and implementation notes for future contributors or coding agents
