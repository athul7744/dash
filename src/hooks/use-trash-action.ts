"use client";

import { useCallback } from "react";

import { useToast } from "@/components/toast/ToastProvider";
import { softDeleteEntity, restoreEntity, cascadeOccurrences, type TrashKind } from "@/lib/shared/trash";

function short(label?: string): string {
  if (!label) return "";
  const t = label.trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

/**
 * The shared "delete → undo toast" action. Soft-deletes the entity immediately
 * (it leaves its list and animates out) and shows a toast whose Undo restores it.
 * If the toast expires the item stays in the Trash, recoverable from `/trash`.
 */
export function useTrashAction(): (kind: TrashKind, id: string, label?: string) => void {
  const { toast } = useToast();
  return useCallback(
    (kind, id, label) => {
      void softDeleteEntity(kind, id);
      const name = short(label);
      toast({
        message: name ? `Deleted “${name}”` : "Deleted",
        actionLabel: "Undo",
        onAction: () => void restoreEntity(kind, id),
      });
    },
    [toast],
  );
}

/**
 * Trash a task that already applied its own optimistic state change (TaskCard).
 * Cascades the occurrence log to match, and shows the shared undo toast; Undo
 * calls the caller-supplied restore (which reverses the optimistic state too).
 */
export function useTaskTrashToast(): (id: string, label: string | undefined, onUndo: () => void) => void {
  const { toast } = useToast();
  return useCallback(
    (id, label, onUndo) => {
      void cascadeOccurrences(id, true);
      const name = short(label);
      toast({
        message: name ? `Deleted “${name}”` : "Deleted",
        actionLabel: "Undo",
        onAction: onUndo,
      });
    },
    [toast],
  );
}
