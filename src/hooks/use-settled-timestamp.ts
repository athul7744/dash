"use client";

import { useEffect, useRef, useState } from "react";

import { hasPendingWrites } from "@/lib/shared/debounced-update";
import { hasPendingNoteEdgeReconciles } from "@/lib/notes/notes";
import { useRelativeTimeTick } from "@/hooks/use-relative-time-tick";
import { formatTimestampLabel } from "@/components/notes/page/utils";

type TimestampLabel = { relative: string; absolute: string } | null;

export function useSettledTimestamp(
  selectedPage: { id: string; updated_at: string | null } | undefined | null,
  initialTimestamp: TimestampLabel,
) {
  const [stableUpdatedTimestamp, setStableUpdatedTimestamp] = useState<TimestampLabel>(null);
  const [showAbsoluteUpdatedTime, setShowAbsoluteUpdatedTime] = useState(false);
  const absoluteUpdatedTimeTimeoutRef = useRef<number | null>(null);
  const pendingUpdatedTimestampRef = useRef<TimestampLabel>(null);
  const settleUpdatedTimestampTimeoutRef = useRef<number | null>(null);

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

  const resetTimestamp = (nextTimestamp: TimestampLabel) => {
    setShowAbsoluteUpdatedTime(false);
    setStableUpdatedTimestamp(nextTimestamp);
  };

  useEffect(() => {
    pendingUpdatedTimestampRef.current = initialTimestamp;

    if (!selectedPage) {
      if (settleUpdatedTimestampTimeoutRef.current !== null) {
        window.clearTimeout(settleUpdatedTimestampTimeoutRef.current);
        settleUpdatedTimestampTimeoutRef.current = null;
      }
      setStableUpdatedTimestamp(null);
      return;
    }

    if (!hasPendingWrites() && !hasPendingNoteEdgeReconciles()) {
      if (settleUpdatedTimestampTimeoutRef.current !== null) {
        window.clearTimeout(settleUpdatedTimestampTimeoutRef.current);
        settleUpdatedTimestampTimeoutRef.current = null;
      }
      setStableUpdatedTimestamp(initialTimestamp);
      return;
    }

    if (settleUpdatedTimestampTimeoutRef.current !== null) {
      return;
    }

    const waitForSettledTimestamp = () => {
      if (hasPendingWrites() || hasPendingNoteEdgeReconciles()) {
        settleUpdatedTimestampTimeoutRef.current = window.setTimeout(waitForSettledTimestamp, 240);
        return;
      }

      settleUpdatedTimestampTimeoutRef.current = null;
      setStableUpdatedTimestamp(pendingUpdatedTimestampRef.current);
    };

    settleUpdatedTimestampTimeoutRef.current = window.setTimeout(waitForSettledTimestamp, 240);

    return () => {
      if (settleUpdatedTimestampTimeoutRef.current !== null) {
        window.clearTimeout(settleUpdatedTimestampTimeoutRef.current);
        settleUpdatedTimestampTimeoutRef.current = null;
      }
    };
  }, [selectedPage?.id, selectedPage?.updated_at]);

  const relativeTimeTick = useRelativeTimeTick(30000);

  useEffect(() => {
    if (!selectedPage || hasPendingWrites() || hasPendingNoteEdgeReconciles()) {
      return;
    }

    const nextTimestamp = formatTimestampLabel(selectedPage.updated_at ?? null);
    setStableUpdatedTimestamp((currentTimestamp) => {
      if (
        currentTimestamp?.relative === nextTimestamp?.relative &&
        currentTimestamp?.absolute === nextTimestamp?.absolute
      ) {
        return currentTimestamp;
      }

      return nextTimestamp;
    });
  }, [relativeTimeTick, selectedPage?.id, selectedPage?.updated_at]);

  useEffect(() => {
    return () => {
      if (absoluteUpdatedTimeTimeoutRef.current !== null) {
        window.clearTimeout(absoluteUpdatedTimeTimeoutRef.current);
      }
    };
  }, []);

  return {
    stableUpdatedTimestamp,
    showAbsoluteUpdatedTime,
    revealAbsoluteUpdatedTime,
    resetTimestamp,
  };
}
