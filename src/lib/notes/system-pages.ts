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
export type SystemPageKind = "journal" | "quote" | "bookmark" | "reminder";

/** Namespace for deterministic system-page ids (mirrors EDGE_ID_NAMESPACE in notes.ts). */
export const SYSTEM_PAGE_NAMESPACE = "b6f0e4a2-1c7d-4f3a-9e58-2a4c8d5b1f90";

/**
 * Deterministic page id for a feature-owned page. Same (userId, kind, key)
 * always maps to the same id, so a page can be located reactively without a
 * lookup and created idempotently without a race.
 */
export function systemPageId(userId: string, kind: SystemPageKind, key: string): string {
  return uuidv5(`${kind}:${userId}:${key}`, SYSTEM_PAGE_NAMESPACE);
}
