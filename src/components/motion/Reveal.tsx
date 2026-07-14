"use client";

import type { ReactNode, RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/shared/motion";

/**
 * Scroll-triggered reveal: fades + slides its children up the first time they
 * enter the viewport. Reusable across the app.
 *
 * `root` is the scroll container ref for pages that scroll inside an element
 * rather than the window (the dashboard does). Honors reduced-motion.
 */
export function Reveal({
  children,
  className,
  root,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  root?: RefObject<HTMLElement | null>;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, root }}
      transition={{ duration: DURATION.slow, ease: EASE.standard, delay }}
    >
      {children}
    </motion.div>
  );
}
