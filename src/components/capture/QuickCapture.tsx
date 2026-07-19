"use client";

import { useEffect, useState } from "react";

import { CaptureTriage } from "@/components/capture/CaptureTriage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { IncomingSharePayload } from "@/lib/shared/share";

/**
 * In-app quick capture: paste/type a link or text, then triage it into any app.
 * Covers desktop and any time the system share sheet isn't used. Best-effort
 * clipboard prefill on open (falls back to manual paste).
 */
export function QuickCapture({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [seed, setSeed] = useState("");
  const [payload, setPayload] = useState<IncomingSharePayload | null>(null);

  // Reset to the seed step each time the dialog opens (render-time, so no
  // cascading-effect setState).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSeed("");
      setPayload(null);
    }
  }

  // Best-effort clipboard prefill on open (async callback — falls back to manual paste).
  useEffect(() => {
    if (!open) return;
    void navigator.clipboard
      ?.readText()
      .then((text) => {
        if (text?.trim()) setSeed(text.trim());
      })
      .catch(() => {
        /* clipboard blocked */
      });
  }, [open]);

  const start = () => {
    const text = seed.trim();
    if (text) setPayload({ title: "", text, url: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Capture</DialogTitle>
        <DialogDescription className="sr-only">Save a link or text to Dash.</DialogDescription>

        {payload ? (
          <CaptureTriage payload={payload} mode="modal" onClose={() => onOpenChange(false)} />
        ) : (
          <div className="flex flex-col gap-3">
            <textarea
              autoFocus
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  start();
                }
              }}
              rows={3}
              placeholder="Paste a link or text…"
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={start} disabled={!seed.trim()}>
                Continue
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
