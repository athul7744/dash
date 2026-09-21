/// <reference types="vitest/globals" />

/**
 * A screen you come back to should already be there.
 *
 * Leaving an app unmounts its screen and closes every query it was watching;
 * returning builds them again from nothing, which is the skeleton-on-every-
 * navigation that makes an app feel like a website. The rows a query last
 * settled on are kept outside React so the next mount can paint them at once.
 *
 * The two things that could regress quietly: showing one query's rows to a
 * different query, and showing remembered rows over a real result.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string };
let queryResult: { data: Row[]; isLoading: boolean } = { data: [], isLoading: true };

vi.mock("@powersync/react", () => ({
  useQuery: () => queryResult,
}));

import { clearRememberedQueries, rememberedQueryCount, useCachedQuery } from "@/hooks/use-cached-query";

function Probe({ sql, params }: { sql: string; params?: unknown[] }) {
  const { data, isLoading } = useCachedQuery<Row>(sql, params);
  return <span>{isLoading ? "loading" : data.map((r) => r.id).join(",") || "empty"}</span>;
}

let container: HTMLDivElement;
let root: Root;

const render = (sql: string, params?: unknown[]) => {
  act(() => root.render(<Probe sql={sql} params={params} />));
  return container.textContent ?? "";
};

/** Unmount and mount afresh — what navigating away and back does. */
const remount = () => {
  act(() => root.unmount());
  root = createRoot(container);
};

beforeEach(() => {
  clearRememberedQueries();
  queryResult = { data: [], isLoading: true };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useCachedQuery", () => {
  it("has nothing to show on a first visit", () => {
    expect(render("SELECT 1")).toBe("loading");
  });

  it("paints the remembered rows immediately on the next visit", () => {
    queryResult = { data: [{ id: "a" }, { id: "b" }], isLoading: true };
    render("SELECT 1");
    queryResult = { data: [{ id: "a" }, { id: "b" }], isLoading: false };
    expect(render("SELECT 1")).toBe("a,b");

    remount();
    // The new query has not returned yet — this is the frame that used to be a skeleton.
    queryResult = { data: [], isLoading: true };
    expect(render("SELECT 1")).toBe("a,b");
  });

  it("prefers a real result over the remembered one", () => {
    queryResult = { data: [{ id: "a" }], isLoading: false };
    render("SELECT 1");
    remount();
    queryResult = { data: [{ id: "b" }], isLoading: false };
    expect(render("SELECT 1")).toBe("b");
  });

  it("remembers a settled empty result as empty, not as the rows before it", () => {
    queryResult = { data: [{ id: "a" }], isLoading: false };
    render("SELECT 1");
    queryResult = { data: [], isLoading: false };
    render("SELECT 1");

    remount();
    queryResult = { data: [], isLoading: true };
    expect(render("SELECT 1")).toBe("empty");
  });

  it("keeps each query's rows to itself", () => {
    queryResult = { data: [{ id: "a" }], isLoading: false };
    render("SELECT 1");
    remount();
    queryResult = { data: [], isLoading: true };
    expect(render("SELECT 2")).toBe("loading");
  });

  it("tells queries apart by their parameters", () => {
    queryResult = { data: [{ id: "monday" }], isLoading: false };
    render("SELECT ?", ["2026-09-21"]);
    remount();
    queryResult = { data: [], isLoading: true };
    expect(render("SELECT ?", ["2026-09-22"])).toBe("loading");
    expect(render("SELECT ?", ["2026-09-21"])).toBe("monday");
  });

  it("bounds what it holds", () => {
    queryResult = { data: [{ id: "x" }], isLoading: false };
    for (let i = 0; i < 60; i++) {
      remount();
      render(`SELECT ${i}`);
    }
    expect(rememberedQueryCount()).toBeLessThanOrEqual(48);
  });
});
