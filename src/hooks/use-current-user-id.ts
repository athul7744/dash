"use client";

import { useEffect, useState } from "react";

import { cachedUserIdOrNull, getCurrentUserId } from "@/lib/shared/auth";

/**
 * The current user's id.
 *
 * Known immediately once it has been resolved anywhere this session, which is
 * what lets a screen build its query on its first render rather than after one
 * empty pass — the difference between returning to a screen and rebuilding it.
 * The first resolution of all is still asynchronous, so it stays null until the
 * stored session has been read.
 */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(() => cachedUserIdOrNull());

  useEffect(() => {
    if (userId) return;
    let active = true;
    getCurrentUserId()
      .then((id) => {
        if (active && id) setUserId(id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  return userId;
}
