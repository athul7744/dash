"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Fires a list page's own "create" handler once when reached via `?new=1` (the
 * command palette's "New <item>" commands), then strips the param so a refresh
 * doesn't create a second one. Pass `ready` so it waits for the page to settle.
 */
export function useNewItemParam(onNew: () => void, ready: boolean): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wantsNew = searchParams.get("new") === "1";
  const fired = useRef(false);

  useEffect(() => {
    if (!ready || !wantsNew || fired.current) return;
    fired.current = true;
    onNew();
    router.replace(pathname, { scroll: false });
  }, [ready, wantsNew, pathname, router, onNew]);
}
