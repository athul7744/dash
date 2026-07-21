"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { QuickCapture } from "@/components/capture/QuickCapture";

const CaptureContext = createContext<() => void>(() => {});

/** Open the quick-capture modal from anywhere under <CaptureProvider>. */
export const useCapture = () => useContext(CaptureContext);

/**
 * Mounts the quick-capture modal once, app-wide, and registers the ⌘/Ctrl+I
 * shortcut. Lives in the root layout so capture works on every route, not just
 * the dashboard.
 */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openCapture = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "i")) return;
      // Don't hijack the keystroke while the user is typing in a field/editor.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CaptureContext.Provider value={openCapture}>
      {children}
      <QuickCapture open={open} onOpenChange={setOpen} />
    </CaptureContext.Provider>
  );
}
