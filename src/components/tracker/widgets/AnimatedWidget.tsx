"use client";

import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/shared/motion";

/**
 * Entrance wrapper for the tracker week widgets: fades + slides up once on mount,
 * `delay`ed for a staggered reveal across the widget grid. Motion-backed so it
 * honors reduced-motion automatically. API-compatible with the prior CSS-in-JS
 * version ({ children, className, delay }).
 */
export function AnimatedWidget({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className} style={{ height: "100%" }}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      style={{ height: "100%" }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE.standard, delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}
