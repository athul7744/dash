"use client";

import { cn } from "@/lib/shared/utils";

/**
 * A determinate progress bar for a long local job — a search-index build, a vault
 * import. Renders the count as its accessible value so a screen reader gets the
 * same information the label shows.
 */
export function ProgressBar({
  done,
  total,
  label,
  className,
  barClassName,
}: {
  done: number;
  total: number;
  label: string;
  className?: string;
  barClassName?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div
      className={cn("h-0.5 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      title={`${label} ${done}/${total}`}
    >
      <div
        className={cn("h-full bg-violet-500 transition-[width] duration-300 ease-out dark:bg-violet-400", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
