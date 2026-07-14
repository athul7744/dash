"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { popoverPresence } from "@/lib/shared/motion";

/**
 * Enter/exit wrapper for hand-rolled popovers/overlays (fixed/absolute divs that
 * are NOT Base UI, so they unmount abruptly). Mount `<Presence>` unconditionally
 * and toggle `open`; it animates the child in on open and out on close using the
 * shared {@link popoverPresence} spec. Honors reduced-motion (renders instantly).
 *
 * Set `style.transformOrigin` via `motionProps` to zoom from the anchor edge.
 */
export function Presence({
  open,
  children,
  className,
  ...rest
}: {
  open: boolean;
  children: ReactNode;
} & ComponentPropsWithoutRef<typeof motion.div>) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={className}
          variants={reduce ? undefined : popoverPresence}
          initial={reduce ? false : "initial"}
          animate={reduce ? {} : "animate"}
          exit={reduce ? {} : "exit"}
          {...rest}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
