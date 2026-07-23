import { cn } from "@/lib/shared/utils";

/**
 * The "section break" heading on the collection pages (bookmarks / quotes /
 * reminders): an uppercase label, a muted count, and a fading rule that sets the
 * collection apart from the daily hero above it. `className` carries each page's
 * own top/bottom margin.
 */
export function CollectionHeading({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</h2>
      <span className="text-xs tabular-nums text-muted-foreground/50">{count}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
    </div>
  );
}
