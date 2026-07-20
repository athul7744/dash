"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import type { Mood } from "@/lib/tracker/moods";

type MoodRow = { id: string; label: string | null; color: string | null; value: number | null };

/** Live, ordered list of the user's configured moods (worst→best). */
export function useMoods(): Mood[] {
  const { data = [] } = useQuery<MoodRow>("SELECT id, label, color, value FROM moods ORDER BY value ASC");
  return useMemo(
    () =>
      data.map((row) => ({
        id: row.id,
        label: row.label ?? "",
        color: row.color ?? "slate",
        value: row.value ?? 0,
      })),
    [data],
  );
}
