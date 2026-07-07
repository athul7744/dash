// Supabase Edge Function: send-push-notification
//
// Self-contained: given a notification `type`, it runs the relevant query (via the
// SECURITY DEFINER SQL helpers), builds the content, and sends Web Push payloads to
// each target user's subscriptions. An external scheduler just POSTs a `type` on a
// cadence with the shared secret (X-Trigger-Secret header) — no per-user payload.
//
// Deploy with "Verify JWT" OFF (this function uses its own shared-secret auth, not a
// Supabase JWT):  supabase functions deploy send-push-notification --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SB_SECRET_KEY,
//          PUSH_TRIGGER_SECRET  (SUPABASE_URL is auto-injected by the edge runtime)
//
// SB_SECRET_KEY is a server-side key that bypasses RLS (needed to read every user's
// subscriptions and prune expired ones). Use a new secret key (sb_secret_...) from
// Dashboard -> Project Settings -> API Keys; the legacy service_role JWT also works if
// your instance predates the new key system. It is NOT named SUPABASE_SECRET_KEY
// because Supabase reserves the SUPABASE_ prefix for its own secrets.
// Schema:  see SETUP.md "Push notifications schema" (push_subscriptions table +
//          users_without_recent_logs / pending_tasks_due_today RPCs).
//
// NOTE: `npm:web-push` relies on Node crypto shims. It works on Supabase's hosted edge
// runtime; on a self-hosted runtime confirm compatibility (fallback: a Deno-native
// web-push library).

import webpush from "npm:web-push@3.6.7";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

type NotificationType = "tracker-reminder" | "daily-tasks";

interface RequestBody {
  type: NotificationType;
}

interface PushContent {
  title: string;
  body: string;
  url: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Configure VAPID + service-role client once per cold start.
webpush.setVapidDetails(
  env("VAPID_SUBJECT"),
  env("VAPID_PUBLIC_KEY"),
  env("VAPID_PRIVATE_KEY"),
);

const supabase: SupabaseClient = createClient(
  env("SUPABASE_URL"),
  env("SB_SECRET_KEY"),
);

/** Send `content` to every subscription owned by `userId`; prune expired endpoints. */
async function sendToUser(userId: string, content: PushContent): Promise<number> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .returns<SubscriptionRow[]>();

  if (error) throw new Error(`Failed to load subscriptions: ${error.message}`);
  if (!subs || subs.length === 0) return 0;

  const payload = JSON.stringify(content);
  const staleIds: string[] = [];

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ),
    ),
  );

  let sent = 0;
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      sent++;
      return;
    }
    const statusCode = (result.reason as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      staleIds.push(subs[i].id); // endpoint gone — clean it up
    } else {
      console.error("web-push send failed:", result.reason);
    }
  });

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }

  return sent;
}

/** Resolve (userId -> content) targets for a given notification type. */
async function resolveTargets(
  type: NotificationType,
): Promise<Array<{ userId: string; content: PushContent }>> {
  if (type === "tracker-reminder") {
    const { data, error } = await supabase
      .rpc("users_without_recent_logs", { hours: 2 })
      .returns<Array<{ user_id: string }>>();
    if (error) throw new Error(`users_without_recent_logs failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      userId: row.user_id,
      content: {
        title: "Log your time",
        body: "You haven't tracked anything in the last 2 hours.",
        url: "/tracker",
      },
    }));
  }

  // daily-tasks
  const { data, error } = await supabase
    .rpc("pending_tasks_due_today", { tz: "Asia/Kolkata" })
    .returns<Array<{ user_id: string; task_count: number }>>();
  if (error) throw new Error(`pending_tasks_due_today failed: ${error.message}`);
  return (data ?? [])
    .filter((row) => row.task_count > 0)
    .map((row) => ({
      userId: row.user_id,
      content: {
        title: "Tasks due today",
        body: `You have ${row.task_count} task${row.task_count === 1 ? "" : "s"} due today.`,
        url: "/",
      },
    }));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  // Custom shared-secret auth. Deploy this function with "Verify JWT" OFF so the
  // Supabase gateway lets the request through to this check (our scheduler sends a
  // shared secret, not a Supabase JWT). A custom header avoids overloading the
  // platform's Authorization / apikey headers.
  if (req.headers.get("X-Trigger-Secret") !== env("PUSH_TRIGGER_SECRET")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (body.type !== "tracker-reminder" && body.type !== "daily-tasks") {
    return new Response(
      JSON.stringify({ error: "type must be 'tracker-reminder' or 'daily-tasks'" }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    const targets = await resolveTargets(body.type);
    const counts = await Promise.all(
      targets.map((t) => sendToUser(t.userId, t.content)),
    );
    const notified = counts.reduce((sum, n) => sum + n, 0);

    return new Response(
      JSON.stringify({ type: body.type, users: targets.length, notified }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
