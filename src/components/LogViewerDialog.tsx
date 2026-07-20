"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Logs } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getRecentLogs, subscribeToLogs, type LogEntry } from "@/lib/shared/logger";
import { cn } from "@/lib/shared/utils";

interface LogViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Severity is encoded by a small dot + label colour — semantic, not decorative.
const levelDot: Record<LogEntry["level"], string> = {
  info: "bg-sky-500",
  warn: "bg-amber-500",
  error: "bg-rose-500",
};
const levelText: Record<LogEntry["level"], string> = {
  info: "text-sky-600 dark:text-sky-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-rose-600 dark:text-rose-400",
};

const LogRow = memo(function LogRow({ log }: { log: LogEntry }) {
  const timestamp = new Date(log.timestamp);

  return (
    <article className="py-2.5" style={{ contentVisibility: "auto", containIntrinsicSize: "72px" }}>
      <div className="flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", levelDot[log.level])} />
        <span className={cn("text-[10px] font-medium uppercase tracking-[0.14em]", levelText[log.level])}>
          {log.level}
        </span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
          {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-[family:var(--font-geist-mono)] text-[11.5px] leading-5 text-foreground">
        {log.message}
      </pre>
    </article>
  );
});

export function LogViewerDialog({ open, onOpenChange }: LogViewerDialogProps) {
  const [logs, setLogs] = useState(() => getRecentLogs());

  useEffect(() => {
    setLogs(getRecentLogs());
    return subscribeToLogs(() => setLogs(getRecentLogs()));
  }, []);

  const counts = useMemo(() => {
    return logs.reduce(
      (summary, log) => {
        summary[log.level] += 1;
        return summary;
      },
      { info: 0, warn: 0, error: 0 }
    );
  }, [logs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border border-border/60 bg-background p-0 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.4)] sm:max-h-[min(90dvh,52rem)] sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="space-y-0 border-b border-border/50 px-5 pb-3.5 pt-5 text-left">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2 font-serif text-xl text-foreground">
              <Logs className="h-4 w-4 text-muted-foreground" />
              Logs
            </DialogTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                {counts.info}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {counts.warn}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                {counts.error}
              </span>
              <span className="tabular-nums text-muted-foreground/60">{logs.length}/50</span>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-1" style={{ WebkitOverflowScrolling: "touch" }}>
          {logs.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <Logs className="h-8 w-8 text-muted-foreground/40" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No logs yet</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Entries from this browser session will show up here — the latest 50.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>

        <DialogFooter showCloseButton className="mx-0 mb-0 border-t border-border/50 bg-background" />
      </DialogContent>
    </Dialog>
  );
}
