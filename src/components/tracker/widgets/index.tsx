"use client";

import { WidgetProps } from "./types";
import { ActivityBreakdown } from "./ActivityBreakdown";
import { MoodSummary } from "./MoodSummary";
import { SleepStats } from "./SleepStats";
import { DailyStacks } from "./DailyStacks";
import { ProductivityRatio } from "./ProductivityRatio";
import { AnimatedWidget } from "./AnimatedWidget";

export function WeekWidgets(props: WidgetProps) {
  return (
    <div className="space-y-4 [touch-action:pan-y]">
      {/* Row 1: Sleep + Mood */}
      <div className="grid grid-cols-2 gap-3">
        <AnimatedWidget delay={0}>
          <SleepStats {...props} />
        </AnimatedWidget>
        <AnimatedWidget delay={80}>
          <MoodSummary {...props} />
        </AnimatedWidget>
      </div>

      {/* Row 2: Activity + Daily */}
      <div className="grid grid-cols-2 gap-3">
        <AnimatedWidget delay={0}>
          <ActivityBreakdown {...props} />
        </AnimatedWidget>
        <AnimatedWidget delay={80}>
          <DailyStacks {...props} />
        </AnimatedWidget>
      </div>

      {/* Productivity - same width as grid above */}
      <AnimatedWidget delay={0}>
        <ProductivityRatio {...props} />
      </AnimatedWidget>
    </div>
  );
}
