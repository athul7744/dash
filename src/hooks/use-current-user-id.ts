"use client";

import { useEffect, useState } from "react";

import { getCurrentUserId } from "@/lib/shared/auth";

/**
 * The current user's id, resolved asynchronously on mount (null until it
 * lands). Replaces the hand-rolled `getCurrentUserId().then(setState)` + `active`
 * cleanup effect that was copy-pasted across the app-item hooks and journal.
 */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentUserId()
      .then((id) => {
        if (active) setUserId(id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return userId;
}
