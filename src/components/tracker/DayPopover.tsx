"use client";

import { forwardRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { format } from "date-fns";
import { popoverPresence } from "@/lib/shared/motion";
import { cn } from "@/lib/shared/utils";

interface ActivityEntry {
  name: string;
  count: number;
  hex: string;
}

interface DayPopoverProps {
  day: Date;
  position: { x: number; y: number };
  activities: ActivityEntry[];
  totalHours: number;
  onClose: () => void;
  onEditDay?: () => void;
  /** Optional header content between title and activity list (e.g. rating badge) */
  header?: React.ReactNode;
  /** Show mini progress bars next to hours (activity grid style) */
  showBars?: boolean;
}

export const DayPopover = forwardRef<HTMLDivElement, DayPopoverProps>(
  function DayPopover({ day, position, activities, totalHours, onClose, onEditDay, header, showBars }, ref) {
    const reduce = useReducedMotion();
    return (
      <motion.div
        ref={ref}
        variants={reduce ? undefined : popoverPresence}
        initial={reduce ? false : "initial"}
        animate={reduce ? {} : "animate"}
        exit={reduce ? {} : "exit"}
        className="fixed z-50 w-[240px] rounded-lg border border-border bg-popover shadow-lg"
        style={{ top: position.y, left: position.x }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <span className="text-sm font-semibold text-foreground">{format(day, "EEE, MMM d")}</span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-xs"
          >
            ✕
          </button>
        </div>

        {/* Optional header content (e.g. rating) */}
        {header && <div className="px-3 pb-2">{header}</div>}

        {/* Activity breakdown */}
        {totalHours > 0 && (
          <div className={cn("px-3 space-y-1.5 pb-2", header && "border-t border-border pt-2")}>
            <span className="text-[10px] text-muted-foreground">{totalHours}h logged</span>
            <div className="max-h-[120px] overflow-y-auto space-y-1.5">
              {activities.map((a) => (
                <div key={a.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: a.hex }} />
                  <span className="text-foreground flex-1 truncate">{a.name}</span>
                  <span className="text-muted-foreground font-medium">{a.count}h</span>
                  {showBars && (
                    <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ backgroundColor: a.hex, width: `${(a.count / 24) * 100}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit button */}
        {onEditDay && (
          <div className="border-t border-border px-3 py-2">
            <button
              onClick={onEditDay}
              className="w-full text-xs font-medium py-1.5 rounded bg-accent text-foreground hover:bg-accent/80 transition-colors"
            >
              Edit day
            </button>
          </div>
        )}
      </motion.div>
    );
  }
);
