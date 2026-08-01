"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resetLocalDatabase } from "@/lib/powersync/db";
import { logger } from "@/lib/shared/logger";

interface ResetLocalDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after confirming, so the parent can close the Settings surface too. */
  onConfirmed?: () => void;
}

export function ResetLocalDataDialog({ open, onOpenChange, onConfirmed }: ResetLocalDataDialogProps) {
  const handleReset = () => {
    // Close both dialogs first, then run the reset. The clear + re-init is a
    // heavy main-thread op — deferring a tick lets the close paint before it
    // starts. Progress then shows via the sync indicator + search-index bar.
    onOpenChange(false);
    onConfirmed?.();
    setTimeout(() => {
      resetLocalDatabase().catch((err) => logger.error("Failed to reset local database:", err));
    }, 0);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Local Data?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete your local database and re-download all data from the cloud. Any unsynced changes will be lost. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Reset &amp; Re-sync
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
