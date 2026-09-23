"use client";

import { useEffect, useRef, useState } from "react";

import { hasPendingWrites } from "@/lib/shared/debounced-update";
import { useRelativeTimeTick } from "@/hooks/use-relative-time-tick";
import { formatTimestampLabel } from "@/components/notes/page/utils";

type TimestampLabel = { relative: string; absolute: string } | null;

export function useSettledTimestamp(
  selectedPage: { id: string; updated_at: string | null } | undefined | null,
) {
  const relativeTimeTick = useRelativeTimeTick(30000);
  const pageId = selectedPage?.id ?? null;
  const updatedAt = selectedPage?.updated_at ?? null;
  const [timestampState, setTimestampState] = useState(() => ({
    pageId,
    relativeTimeTick,
    updatedAt,
    value: formatTimestampLabel(updatedAt),
  }));
  const [showAbsoluteUpdatedTime, setShowAbsoluteUpdatedTime] = useState(false);
  const absoluteUpdatedTimeTimeoutRef = useRef<number | null>(null);

  if (timestampState.pageId !== pageId) {
    setTimestampState({
      pageId,
      relativeTimeTick,
      updatedAt,
      value: formatTimestampLabel(updatedAt),
    });
    setShowAbsoluteUpdatedTime(false);
  } else if (
    !hasPendingWrites() &&
    (timestampState.updatedAt !== updatedAt || timestampState.relativeTimeTick !== relativeTimeTick)
  ) {
    setTimestampState({
      pageId,
      relativeTimeTick,
      updatedAt,
      value: formatTimestampLabel(updatedAt),
    });
  }

  const revealAbsoluteUpdatedTime = () => {
    setShowAbsoluteUpdatedTime(true);

    if (absoluteUpdatedTimeTimeoutRef.current !== null) {
      window.clearTimeout(absoluteUpdatedTimeTimeoutRef.current);
    }

    absoluteUpdatedTimeTimeoutRef.current = window.setTimeout(() => {
      setShowAbsoluteUpdatedTime(false);
      absoluteUpdatedTimeTimeoutRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    if (!pageId || !hasPendingWrites()) return;

    let timeoutId: number | null = null;

    const waitForSettledTimestamp = () => {
      if (hasPendingWrites()) {
        timeoutId = window.setTimeout(waitForSettledTimestamp, 240);
        return;
      }

      timeoutId = null;
      setTimestampState({
        pageId,
        relativeTimeTick,
        updatedAt,
        value: formatTimestampLabel(updatedAt),
      });
    };

    timeoutId = window.setTimeout(waitForSettledTimestamp, 240);

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [pageId, relativeTimeTick, updatedAt]);

  useEffect(() => {
    return () => {
      if (absoluteUpdatedTimeTimeoutRef.current !== null) {
        window.clearTimeout(absoluteUpdatedTimeTimeoutRef.current);
      }
    };
  }, []);

  return {
    stableUpdatedTimestamp: timestampState.value as TimestampLabel,
    showAbsoluteUpdatedTime,
    revealAbsoluteUpdatedTime,
  };
}
