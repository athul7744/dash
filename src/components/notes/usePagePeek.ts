"use client";

import { useCallback, useState } from "react";

export type PeekTarget = {
  pageTitle: string;
  anchorRect: DOMRect;
};

export function usePagePeek() {
  const [peekTarget, setPeekTarget] = useState<PeekTarget | null>(null);

  const openPeek = useCallback((target: PeekTarget) => {
    setPeekTarget(target);
  }, []);

  const closePeek = useCallback(() => {
    setPeekTarget(null);
  }, []);

  return {
    peekTarget,
    openPeek,
    closePeek,
  };
}
