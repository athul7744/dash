"use client";

/**
 * Picking up a new deployment.
 *
 * An installed app doesn't reload on its own, and the service worker can't
 * change the page you're already looking at — it can only prepare the next one.
 * So a new version has to be *applied*, and there are three moments to do it:
 * quietly when you come back after being away, on a prompt when you're mid-use,
 * and on demand from Settings.
 *
 * All three go through `applyUpdate`, so the pending-write flush before the
 * reload can never be skipped by one path and not another.
 *
 * The worker waits rather than taking over on its own (`skipWaiting: false` in
 * `sw.ts`). That is what makes a prompt possible, and it also closes a real
 * hazard: a worker that activates under a running page leaves that page asking
 * for JS chunks the new deployment no longer has.
 */

import { flushAllUpdates, hasPendingWrites } from "@/lib/shared/debounced-update";
import { flushAllBlockDocumentPersisters } from "@/lib/notes/editor/block-persister";

/**
 * Away long enough that a reload goes unnoticed.
 *
 * Short enough to catch the next morning's first look, long enough that
 * switching to another app to copy a link doesn't pull the rug.
 */
export const AWAY_BEFORE_SILENT_UPDATE_MS = 10 * 60_000;

/** Whether a return should apply a waiting update without asking. */
export function shouldUpdateSilently(opts: { hiddenForMs: number; hasUnsavedWork: boolean }): boolean {
  if (opts.hasUnsavedWork) return false;
  return opts.hiddenForMs >= AWAY_BEFORE_SILENT_UPDATE_MS;
}

function supported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/** Is a new version downloaded and waiting to take over? */
export async function updateIsWaiting(): Promise<boolean> {
  return Boolean((await registration())?.waiting);
}

/**
 * Ask the server whether there is a new version, and report whether one is now
 * waiting. Safe to call often — the browser coalesces these.
 */
export async function checkForUpdate(): Promise<boolean> {
  const reg = await registration();
  if (!reg) return false;
  try {
    await reg.update();
  } catch {
    /* offline, or the check failed — whatever was already waiting still counts */
  }
  return Boolean(reg.waiting);
}

let applying = false;

/**
 * Hand over to the waiting version and reload onto it.
 *
 * Debounced writes are flushed first: a reload mid-debounce would drop an edit
 * the user believes is saved, and this is the one moment the whole page goes
 * away at once. The reload is driven by `controllerchange` — the new worker
 * reporting that it is in charge — with a timer behind it, because a worker
 * that fails to activate must not leave the app stuck waiting for it.
 */
export async function applyUpdate(): Promise<void> {
  if (applying) return;
  const reg = await registration();
  const waiting = reg?.waiting;
  if (!waiting) return;
  applying = true;

  try {
    await flushAllUpdates();
    await flushAllBlockDocumentPersisters();
  } catch {
    /* a flush that fails shouldn't strand the user on an old version */
  }

  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
  waiting.postMessage({ type: "SKIP_WAITING" });
  window.setTimeout(reload, 3000);
}

/**
 * Call `onReady` when a new version is downloaded and waiting — now, or as soon
 * as one finishes installing. Returns an unsubscribe.
 *
 * The `controller` check on a newly installed worker is what separates an update
 * from a first install: with no controller, this page isn't being replaced, it
 * is being taken over for the first time, and there is nothing to tell anyone.
 */
export function watchForUpdate(onReady: () => void): () => void {
  if (!supported()) return () => {};
  let cancelled = false;

  const track = (reg: ServiceWorkerRegistration) => {
    if (reg.waiting && navigator.serviceWorker.controller) onReady();
    const onFound = () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller && !cancelled) onReady();
      });
    };
    reg.addEventListener("updatefound", onFound);
    return () => reg.removeEventListener("updatefound", onFound);
  };

  let detach: (() => void) | undefined;
  void registration().then((reg) => {
    if (reg && !cancelled) detach = track(reg);
  });

  return () => {
    cancelled = true;
    detach?.();
  };
}

/** Whether anything is still waiting to be written, for the silent-update guard. */
export function hasUnsavedWork(): boolean {
  return hasPendingWrites();
}
