"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

import { DURATION, EASE } from "@/lib/shared/motion";

export interface ToastOptions {
  message: string;
  /** Optional action button (e.g. "Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss after this many ms (default 6000). */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Fire a transient toast (with an optional action). Throws if used outside the provider. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const toastPresence = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE.exit } },
};

// Reduced motion: fade only, no slide/scale.
const toastPresenceReduced = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const reduce = useReducedMotion();
  const variants = reduce ? toastPresenceReduced : toastPresence;

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...opts, id }]);
      const timer = setTimeout(() => dismiss(id), opts.duration ?? 6000);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-50 flex flex-col items-center gap-2 px-[var(--app-gutter-x,1rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+1.5rem)]"
        role="region"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border/70 bg-card/95 px-4 py-2.5 text-sm text-foreground shadow-lg backdrop-blur"
            >
              <span className="min-w-0 flex-1 truncate">{t.message}</span>
              {t.actionLabel && (
                <button
                  type="button"
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                  className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-sky-600 transition-colors hover:bg-accent dark:text-sky-400"
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
