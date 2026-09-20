"use client";

/**
 * Notices a new version and decides how to bring it in.
 *
 * Two moments, one rule between them: if you weren't looking, just do it; if you
 * were, ask. Coming back after a while means a reload costs nothing, so it
 * happens quietly — which is how an installed app is supposed to feel. Finding
 * an update mid-use means a reload would interrupt something, so it waits behind
 * a toast until you say when.
 *
 * Mounted once, inside the toast provider. Renders nothing.
 */

import { useEffect, useRef } from "react";

import { useToast } from "@/components/toast/ToastProvider";
import {
  applyUpdate,
  checkForUpdate,
  hasUnsavedWork,
  shouldUpdateSilently,
  updateIsWaiting,
  watchForUpdate,
} from "@/lib/shared/app-update";

/** How long the offer stays up — long enough to notice, not to nag. */
const OFFER_VISIBLE_MS = 20_000;

export function AppUpdateWatcher() {
  const { toast } = useToast();
  // Guards against stacking two offers, not against ever offering twice: the
  // toast times out, and someone who missed it should be asked again next time
  // they come back rather than be left on an old version.
  const offered = useRef(false);

  useEffect(() => {
    const offer = () => {
      if (offered.current) return;
      offered.current = true;
      toast({
        message: "A new version is ready.",
        actionLabel: "Reload",
        onAction: () => void applyUpdate(),
        // Longer than the usual toast: this one asks for a decision rather than
        // reporting something that already happened.
        duration: OFFER_VISIBLE_MS,
      });
      window.setTimeout(() => {
        offered.current = false;
      }, OFFER_VISIBLE_MS + 500);
    };

    const stop = watchForUpdate(offer);

    // Coming back: check for a new version, and take it without asking if you
    // have been away long enough that a reload goes unnoticed.
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const hiddenForMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      void checkForUpdate().then((waiting) => {
        if (!waiting) return;
        if (shouldUpdateSilently({ hiddenForMs, hasUnsavedWork: hasUnsavedWork() })) {
          void applyUpdate();
          return;
        }
        offer();
      });
    };

    document.addEventListener("visibilitychange", onVisibility);
    // A cold launch is the other moment worth checking: the app may have been
    // closed across several deployments.
    void updateIsWaiting().then((waiting) => waiting && offer());

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [toast]);

  return null;
}
