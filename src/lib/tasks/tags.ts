import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { debouncedExecute } from "@/lib/shared/debounced-update";
import { TAG_COLORS } from "@/lib/tasks/colors";

/**
 * Insert a new tag into the local PowerSync database.
 * Returns the generated tag id so callers can optimistically reference it.
 */
export async function createTag(
  name: string,
  color?: string,
  dedupeKey?: string,
  id?: string
): Promise<string> {
  const resolvedId = id ?? uuidv4();
  const resolvedColor = color ?? TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
  const userId = await getCurrentUserId();

  debouncedExecute(
    `INSERT INTO tags (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    [resolvedId, userId, name, resolvedColor],
    dedupeKey ?? resolvedId
  );

  return resolvedId;
}
/**
 * Resolve tag names to ids, creating the ones that don't exist yet.
 *
 * `createTag` goes through `debouncedExecute`, so a caller that needs the rows to
 * exist *now* — the markdown importer, which writes tag membership inside a
 * transaction moments later — can't use it. This does one read and one batched
 * insert, and returns a name→id map keyed case-insensitively.
 */
export async function ensureTagIdsByName(names: readonly string[]): Promise<Map<string, string>> {
  const wanted = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed) wanted.set(trimmed.toLowerCase(), trimmed);
  }
  if (wanted.size === 0) return new Map();

  const existing = await db.getAll<{ id: string; name: string | null }>("SELECT id, name FROM tags");
  const idByName = new Map<string, string>();
  for (const row of existing) {
    const key = (row.name ?? "").trim().toLowerCase();
    if (key && !idByName.has(key)) idByName.set(key, row.id);
  }

  const missing = [...wanted.entries()].filter(([key]) => !idByName.has(key));
  if (missing.length > 0) {
    const userId = await getCurrentUserId();
    const values = missing.map(() => "(?, ?, ?, ?, datetime('now'))").join(", ");
    const params = missing.flatMap(([key, name], index) => {
      const id = uuidv4();
      idByName.set(key, id);
      return [id, userId, name, TAG_COLORS[index % TAG_COLORS.length]];
    });
    await db.execute(`INSERT INTO tags (id, user_id, name, color, created_at) VALUES ${values}`, params);
  }

  return new Map([...wanted.keys()].map((key) => [key, idByName.get(key) as string]));
}
