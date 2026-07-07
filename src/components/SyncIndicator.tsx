"use client";

import { useStatus } from "@powersync/react";
import { useState, useEffect, useRef } from "react";
import { useRelativeTimeTick } from "@/hooks/use-relative-time-tick";
import { cn, formatRelativeTime } from "@/lib/shared/utils";
import { WifiOff, CloudUpload, CloudDownload, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { reconnectCloud } from "@/lib/powersync/db";

export function SyncIndicator() {
  const status = useStatus();
  const [showSyncedFlash, setShowSyncedFlash] = useState(false);
  const wasSyncingRef = useRef(false);
  useRelativeTimeTick(30000);

  const isConnected = status.connected;
  const isUploading = status.dataFlowStatus?.uploading ?? false;
  const isDownloading = status.dataFlowStatus?.downloading ?? false;
  const isSyncing = isUploading || isDownloading;
  const lastSyncedAt = status.lastSyncedAt;

  // Detect sync completion → flash "Synced" for 2s
  useEffect(() => {
    if (wasSyncingRef.current && !isSyncing && isConnected) {
      setShowSyncedFlash(true);
      const timer = setTimeout(() => setShowSyncedFlash(false), 2000);
      return () => clearTimeout(timer);
    }
    wasSyncingRef.current = isSyncing;
  }, [isSyncing, isConnected]);

  let dotColor = "bg-emerald-500";
  let label = lastSyncedAt ? formatRelativeTime(lastSyncedAt) : "Connected";
  let Icon: React.ElementType | null = null;

  if (!isConnected) {
    dotColor = "bg-rose-500";
    label = "Offline";
    Icon = WifiOff;
  } else if (isSyncing) {
    dotColor = "bg-amber-500";
    if (isUploading) {
      label = "Uploading";
      Icon = CloudUpload;
    } else {
      label = "Downloading";
      Icon = CloudDownload;
    }
  } else if (showSyncedFlash) {
    label = "Synced";
  }

  return (
    <>
      <Popover>
        <PopoverTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground transition-all duration-500 ease-out hover:text-foreground rounded-md px-1.5 py-1 -mx-1.5 -my-1 hover:bg-accent whitespace-nowrap" title={label}>
          <div className="relative flex items-center justify-center">
            <div className={cn("h-2 w-2 rounded-full transition-colors duration-700 ease-out", dotColor)} />
            {isSyncing && (
              <div className={cn("absolute h-2 w-2 rounded-full animate-gentle-pulse", dotColor)} />
            )}
          </div>
          {Icon && <Icon className="h-3 w-3 transition-opacity duration-300" />}
          <span className="transition-opacity duration-300">{label}</span>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-foreground">Sync Status</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className={cn("h-2 w-2 rounded-full", dotColor)} />
                <span className="flex-1">{isConnected ? (isSyncing ? (isUploading ? "Uploading changes..." : "Downloading changes...") : "Connected") : "Offline"}</span>
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
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
