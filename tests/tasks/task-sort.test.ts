/// <reference types="vitest/globals" />

/**
 * The task list's ORDER BY fragments.
 *
 * Worth pinning because the list pages with `LIMIT`: the order decides which
 * rows a "load more" appends, so a fragment that isn't a *total* order makes
 * rows repeat or vanish as the window grows. Every case has to end in `id ASC`,
 * and each one has to put the right things first — undated last when sorting by
 * date, priority rank actually compared rather than its text, null completion
 * timestamps at the end.
 */

import { buildTaskOrderBy, isTaskSort, TASK_SORT_OPTIONS } from "@/lib/tasks/tasks";

describe("buildTaskOrderBy", () => {
  it("orders by due date by default, undated last and priority breaking ties", () => {
    const order = buildTaskOrderBy("due");
    expect(order.startsWith("CASE WHEN due_date IS NULL")).toBe(true);
    expect(order).toContain("due_date ASC");
    expect(order).toContain("CASE priority WHEN 'urgent' THEN 0");
  });

  it("orders by priority rank, then the dated ones", () => {
    const order = buildTaskOrderBy("priority");
    expect(order.startsWith("CASE priority WHEN 'urgent' THEN 0")).toBe(true);
    expect(order).toContain("due_date ASC");
    // The rank is compared as a number, never the priority text.
    expect(order).not.toContain("priority ASC");
  });

  it("orders newest first for created", () => {
    expect(buildTaskOrderBy("created")).toContain("created_at DESC");
  });

  it("sorts titles case-insensitively", () => {
    expect(buildTaskOrderBy("title")).toContain("title COLLATE NOCASE ASC");
  });

  it("ranks priority from the same levels the dots render from", () => {
    // Reversed: urgent ranks 0. A new level in PRIORITY_COLORS joins the CASE
    // automatically, which is the point of deriving it.
    const rank = buildTaskOrderBy("priority");
    expect(rank).toContain("WHEN 'urgent' THEN 0");
    expect(rank).toContain("WHEN 'high' THEN 1");
    expect(rank).toContain("WHEN 'medium' THEN 2");
    expect(rank).toContain("WHEN 'low' THEN 3");
    expect(rank).toContain("ELSE 4 END");
  });

  it("always ends in id so paging is stable", () => {
    for (const { value } of TASK_SORT_OPTIONS) {
      expect(buildTaskOrderBy(value).endsWith("id ASC")).toBe(true);
    }
  });
});

describe("isTaskSort", () => {
  it("accepts the known keys and rejects anything else", () => {
    expect(isTaskSort("priority")).toBe(true);
    expect(isTaskSort("due")).toBe(true);
    expect(isTaskSort(null)).toBe(false);
    expect(isTaskSort("")).toBe(false);
    expect(isTaskSort("priority; DROP TABLE tasks")).toBe(false);
  });
});
