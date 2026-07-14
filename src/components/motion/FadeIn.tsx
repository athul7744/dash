"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { fadeSlideUp } from "@/lib/shared/motion";

type FadeInProps = {
  children: ReactNode;
  /** Seconds to defer the entrance (e.g. for manual stagger). */
  delay?: number;
} & ComponentPropsWithoutRef<typeof motion.div>;

/**
 * Generic entrance wrapper — fades + slides its children up once on mount using
 * the shared {@link fadeSlideUp} spec. The Motion replacement for the
 * `.animate-fade-slide-in` CSS utility. Honors reduced-motion (renders static).
 */
export function FadeIn({ children, delay = 0, className, ...rest }: FadeInProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className}>{children}</div>
    );
  }

  return (
    <motion.div
      className={className}
      variants={fadeSlideUp}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
