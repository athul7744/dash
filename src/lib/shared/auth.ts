import { createClient } from "@/lib/supabase/client";

let cachedUserId: string | null = null;

/**
 * Get the currently authenticated user's ID.
 *
 * Reads from `getSession()` (the session persisted in local storage), NOT
 * `getUser()` — `getUser()` makes a network request to the auth server, so
 * offline it fails and yields an empty id. That empty id silently breaks every
 * offline read that resolves a system page from the user id (journal, bookmarks,
 * quotes, events) and would tag offline writes with `user_id = ""`. `getSession`
 * returns the stored session (with `user.id`) with no network, so this works
 * offline. Cached after the first non-empty result (the id can't change mid-session).
 */
export async function getCurrentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  cachedUserId = session?.user?.id || "";
  return cachedUserId;
}

/**
 * The id if it has already been resolved this session, else null.
 *
 * `getCurrentUserId` caches, but it is a promise, so anything awaiting it
 * renders once without an id however many times it has been called before. A
 * screen that derives a system page from the id therefore had nothing to query
 * on its first render — a skeleton frame on every visit, for a value that was
 * sitting in a variable. Callers that can use it synchronously read this and
 * keep the promise as the fallback for the first resolution.
 */
export function cachedUserIdOrNull(): string | null {
  return cachedUserId || null;
}
