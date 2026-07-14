"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { staggerContainer, staggerItem } from "@/lib/shared/motion";

/**
 * A list whose children enter (staggered), exit, and re-flow when items are
 * added or removed. Wrap the items in `<AnimatedList>` and make each item a
 * `<MotionListItem key=…>`. Supersedes the `.animate-stagger` CSS utility by
 * also giving exit + layout animation. Honors reduced-motion (renders static).
 *
 * Note: `layout` (on by default) uses FLIP, which is unreliable inside a CSS
 * multi-column (`columns-*`) container — pass `layout={false}` there.
 */
export function AnimatedList({
  children,
  className,
  ...rest
}: { children: ReactNode } & ComponentPropsWithoutRef<typeof motion.div>) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      {...rest}
    >
      <AnimatePresence>{children}</AnimatePresence>
    </motion.div>
  );
}

export function MotionListItem({
  children,
  className,
  layout = true,
  ...rest
}: {
  children: ReactNode;
  layout?: boolean;
} & ComponentPropsWithoutRef<typeof motion.div>) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={staggerItem}
      initial="initial"
      animate="animate"
      exit="exit"
      layout={layout}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
