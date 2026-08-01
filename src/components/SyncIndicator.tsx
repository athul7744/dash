"use client";

import { useStatus } from "@powersync/react";
import { useState, useEffect, useRef } from "react";
import { useSearchIndexProgress } from "@/hooks/use-search-index";
import { useRelativeTimeTick } from "@/hooks/use-relative-time-tick";
import { cn, formatRelativeTime } from "@/lib/shared/utils";
import { WifiOff, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { reconnectCloud } from "@/lib/powersync/db";

/**
 * Smooth a flickering boolean into a calm one: it only turns true after
 * `appearAfter` ms of sustained truth (so brief sync blips are ignored), and
 * once true it stays for at least `holdFor` ms — so the indicator never flashes
 * rapidly on and off.
 */
function useCalmFlag(active: boolean, appearAfter = 350, holdFor = 1000): boolean {
  const [shown, setShown] = useState(false);
  const shownAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (active && !shown) {
      timerRef.current = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShown(true);
      }, appearAfter);
    } else if (!active && shown) {
      const remaining = Math.max(0, holdFor - (Date.now() - shownAtRef.current));
      timerRef.current = setTimeout(() => setShown(false), remaining);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, shown, appearAfter, holdFor]);

  return shown;
}

export function SyncIndicator() {
  const status = useStatus();
  const searchIndex = useSearchIndexProgress();
  useRelativeTimeTick(30000);

  const isConnected = status.connected;
  const isSyncing =
    (status.dataFlowStatus?.uploading ?? false) || (status.dataFlowStatus?.downloading ?? false);
  const lastSyncedAt = status.lastSyncedAt;

  // Calm, debounced syncing state — one "Syncing" instead of a fast up/down flip.
  const syncing = useCalmFlag(isConnected && isSyncing);

  // Flash "Synced" for 2s once a (smoothed) sync settles.
  const [showSyncedFlash, setShowSyncedFlash] = useState(false);
  const wasSyncingRef = useRef(false);
  useEffect(() => {
    if (wasSyncingRef.current && !syncing && isConnected) {
      setShowSyncedFlash(true);
      const timer = setTimeout(() => setShowSyncedFlash(false), 2000);
      wasSyncingRef.current = syncing;
      return () => clearTimeout(timer);
    }
    wasSyncingRef.current = syncing;
  }, [syncing, isConnected]);

  // Raw, un-smoothed status for debugging — this updates live even when the
  // calmed indicator above shows no visible change.
  const searchIndexValue =
    searchIndex.status === "building" && searchIndex.total > 0
      ? `building ${searchIndex.done}/${searchIndex.total}`
      : searchIndex.status;

  const rawStatus: Array<[string, string]> = [
    ["connected", String(status.connected)],
    ["connecting", String(status.connecting)],
    ["hasSynced", String(status.hasSynced ?? "—")],
    ["uploading", String(status.dataFlowStatus?.uploading ?? false)],
    ["downloading", String(status.dataFlowStatus?.downloading ?? false)],
    ["lastSyncedAt", lastSyncedAt ? lastSyncedAt.toISOString() : "—"],
    ["searchIndex", searchIndexValue],
  ];

  let dotColor = "bg-emerald-500";
  let label = lastSyncedAt ? formatRelativeTime(lastSyncedAt) : "Connected";

  if (!isConnected) {
    dotColor = "bg-rose-500";
    label = "Offline";
  } else if (syncing) {
    dotColor = "bg-amber-500";
    label = "Syncing";
  } else if (showSyncedFlash) {
    label = "Synced";
  }

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-500 ease-out hover:text-foreground rounded-md px-1.5 py-1 -mx-1.5 -my-1 hover:bg-accent whitespace-nowrap"
        title={label}
      >
        <div className="relative flex items-center justify-center">
          <div className={cn("h-2 w-2 rounded-full transition-colors duration-700 ease-out", dotColor)} />
          {syncing && (
            <div className={cn("absolute h-2 w-2 rounded-full animate-gentle-pulse", dotColor)} />
          )}
        </div>
        {!isConnected && <WifiOff className="h-3 w-3" />}
        <span className="transition-opacity duration-500 ease-out">{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-foreground">Sync Status</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={cn("h-2 w-2 rounded-full", dotColor)} />
              <span className="flex-1">
                {!isConnected ? "Offline" : syncing ? "Syncing changes…" : "Connected"}
              </span>
              <button
                onClick={() => reconnectCloud()}
                className="p-1 rounded-md hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
                title="Reconnect"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {lastSyncedAt && (
              <p className="text-[11px] text-muted-foreground/70 ml-4">
                Last synced {formatRelativeTime(lastSyncedAt)}
              </p>
            )}
            {searchIndex.status === "building" && (
              <p className="ml-4 text-[11px] text-violet-600 dark:text-violet-400">
                Indexing search…{searchIndex.total > 0 ? ` ${searchIndex.done}/${searchIndex.total}` : ""}
              </p>
            )}
          </div>

          {/* Live raw status — for debugging when the calm indicator shows nothing. */}
          <div className="flex flex-col gap-0.5 border-t border-border/40 pt-2">
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
              Raw status
            </p>
            {rawStatus.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3 font-mono text-[10px] leading-relaxed">
                <span className="text-muted-foreground/70">{key}</span>
                <span
                  className={cn(
                    "break-all text-right",
                    value === "true" && "text-emerald-600 dark:text-emerald-400",
                    value === "false" && "text-muted-foreground/50",
                  )}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
