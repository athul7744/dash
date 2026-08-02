import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { setEntityTags } from "@/lib/tags/entity-tags";

export interface CreateTaskInput {
  title: string;
  link?: string | null;
  dueDate?: Date | null;
  tags?: string[];
  priority?: "low" | "medium" | "high" | "urgent";
  /** Optional deterministic id (e.g. reminders derive one per occurrence for idempotency). */
  id?: string;
}

/**
 * Create a task. Extracted from the inline INSERTs (share page, TodayTasks,
 * TaskCard) so capture and share share one path. Lives in its own module so
 * `tasks.ts` stays DB-free (the pure capture classifier imports URL helpers
 * from it, and tests load that classifier).
 */
export async function createTask(input: CreateTaskInput): Promise<string> {
  const id = input.id ?? uuidv4();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO tasks (id, user_id, title, priority, link, state, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      id,
      userId,
      input.title,
      input.priority ?? "medium",
      input.link?.trim() || null,
      input.dueDate ? input.dueDate.toISOString() : null,
      now,
      now,
    ],
  );
  if (input.tags?.length) await setEntityTags(id, "task", input.tags);
  return id;
}
