/// <reference types="vitest/globals" />

/**
 * The one task-create path every surface writes through (the draft card, the
 * share page, universal capture, event materialisation).
 *
 * The card used to keep its own INSERT alongside this one and the two had
 * already drifted — the card passed no priority fallback and hardcoded the
 * state. These assertions pin the row shape so a caller can't quietly get a
 * different task than the one it asked for.
 */

const hoisted = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _args: unknown[]) => {}),
  setEntityTags: vi.fn(async () => {}),
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/powersync/db", () => ({ db: { execute: hoisted.execute } }));
vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId: hoisted.getCurrentUserId }));
vi.mock("@/lib/tags/entity-tags", () => ({ setEntityTags: hoisted.setEntityTags }));

import { createTask } from "@/lib/tasks/create-task";

/** The parameter tuple handed to `db.execute`, whatever the SQL looked like. */
function insertedArgs() {
  return hoisted.execute.mock.calls[0]?.[1] as unknown[];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTask", () => {
  it("fills in the defaults and starts the task pending", async () => {
    const id = await createTask({ title: "Buy milk" });

    const sql = String(hoisted.execute.mock.calls[0]?.[0]);
    expect(sql).toContain("INSERT INTO tasks");
    expect(sql).toContain("'pending'");

    const [rowId, userId, title, priority, link, dueDate, createdAt, updatedAt] = insertedArgs();
    expect(rowId).toBe(id);
    expect(userId).toBe("user-1");
    expect(title).toBe("Buy milk");
    expect(priority).toBe("medium");
    expect(link).toBeNull();
    expect(dueDate).toBeNull();
    expect(createdAt).toBe(updatedAt);
    expect(uuidPattern.test(String(id))).toBe(true);
  });

  it("keeps a caller-supplied id, so a reminder can be idempotent", async () => {
    const id = await createTask({ title: "Pay rent", id: "fixed-id" });
    expect(id).toBe("fixed-id");
    expect(insertedArgs()[0]).toBe("fixed-id");
  });

  it("carries the priority, trimmed link, and an ISO due date", async () => {
    const dueDate = new Date("2026-11-20T00:00:00.000Z");
    await createTask({ title: "Read the spec", priority: "high", link: "  https://example.com  ", dueDate });

    const [, , , priority, link, due] = insertedArgs();
    expect(priority).toBe("high");
    expect(link).toBe("https://example.com");
    expect(due).toBe(dueDate.toISOString());
  });

  it("writes tag membership only when tags were given", async () => {
    await createTask({ title: "Untagged" });
    expect(hoisted.setEntityTags).not.toHaveBeenCalled();

    const id = await createTask({ title: "Tagged", tags: ["tag-1", "tag-2"] });
    expect(hoisted.setEntityTags).toHaveBeenCalledWith(id, "task", ["tag-1", "tag-2"]);
  });

  it("stores an empty link as NULL rather than an empty string", async () => {
    await createTask({ title: "Blank link", link: "   " });
    expect(insertedArgs()[4]).toBeNull();
  });
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
