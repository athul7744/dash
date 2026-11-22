"use client";

import { Calendar } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";

interface YearSelectProps {
  years: readonly number[];
  value: number;
  onChange: (year: number) => void;
  className?: string;
}

/**
 * The calendar icon plus year dropdown used by the tracker's year grids and by
 * the highlights year list.
 *
 * Extracted from `TrackerWorkspace`, which rendered the same control twice (once
 * per year view) — so the years list, the trigger size and the touch behaviour
 * stay in one place wherever a year is picked.
 */
export function YearSelect({ years, value, onChange, className }: YearSelectProps) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2 [touch-action:pan-y]", className)}>
      <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
      <Select
        value={value}
        onValueChange={(next: number | null) => {
          if (next != null) onChange(parseInt(String(next), 10));
        }}
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year} value={year}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
