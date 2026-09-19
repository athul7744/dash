import { v5 as uuidv5 } from "uuid";

/**
 * "System pages" are notes pages/blocks rows owned by a feature (the tracker's
 * weekly journal, and later e.g. saved quotes) rather than the free-form /notes
 * app. They live in the same `pages`/`blocks` tables so they get the block
 * editor + sync for free, but are tagged with a non-null `properties.kind` and
 * excluded from every /notes listing (see `useAllNotePages` / `useRecentNotePages`).
 *
 * Adding a new system-page feature = pick a new `kind`; the /notes filter and
 * this id scheme cover it with no further changes.
 */
export type SystemPageKind = "journal" | "quote" | "bookmark" | "event";

/** Namespace for deterministic system-page ids (mirrors EDGE_ID_NAMESPACE in links.ts). */
export const SYSTEM_PAGE_NAMESPACE = "b6f0e4a2-1c7d-4f3a-9e58-2a4c8d5b1f90";

/**
 * Deterministic page id for a feature-owned page. Same (userId, kind, key)
 * always maps to the same id, so a page can be located reactively without a
 * lookup and created idempotently without a race.
 */
export function systemPageId(userId: string, kind: SystemPageKind, key: string): string {
  return uuidv5(`${kind}:${userId}:${key}`, SYSTEM_PAGE_NAMESPACE);
}

/**
 * What a day's journal page is titled with, and how that title reads as a day.
 *
 * A day reference wears the date, not the page's name, so three places take the
 * prefix back off — the ref resolver, the graph, the `[[` picker. Built and
 * stripped here so changing the title can't leave one of them showing
 * "Journal · Tue, Sep 15, 2026" while the others show the date.
 */
export const JOURNAL_TITLE_PREFIX = "Journal · ";

export function dayLabelFromPageTitle(pageTitle: string | null | undefined): string {
  const title = (pageTitle ?? "").trim();
  const label = title.startsWith(JOURNAL_TITLE_PREFIX) ? title.slice(JOURNAL_TITLE_PREFIX.length).trim() : title;
  return label || "A day";
}
