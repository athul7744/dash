"use client";

import * as React from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { SmilePlus } from "lucide-react";

import { ManageNamedColorItemsDialog, type ManagedColorDraft } from "@/components/ManageNamedColorItemsDialog";
import { getCurrentUserId } from "@/lib/shared/auth";
import { cancelExecute, debouncedExecute } from "@/lib/shared/debounced-update";
import { ACTIVITY_CELL_CLASSES, getActivityDotClass } from "@/lib/tracker/activities";
import { MOOD_COLORS } from "@/lib/tracker/moods";

interface ManageMoodsDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

type MoodRow = { id: string; label: string | null; color: string | null; value: number | null };

/**
 * Manage the mood scale (worst→best). Reuses the shared named-color dialog:
 * the mood's `label` is the editable name, and new moods append as the next
 * value (the new "best"). Position IS the value, so there's no reorder —
 * renaming/recoloring/adding/deleting only.
 */
export function ManageMoodsDialog({ children, open, onOpenChange, hideTrigger = false }: ManageMoodsDialogProps) {
  const db = usePowerSync();
  const { data: moods = [] } = useQuery<MoodRow>("SELECT id, label, color, value FROM moods ORDER BY value ASC");

  // The generic dialog uses `name`; map the mood's label onto it.
  const items = moods.map((m) => ({ id: m.id, name: m.label, color: m.color }));

  const handleAdd = async ({ id, name, color }: ManagedColorDraft) => {
    const userId = await getCurrentUserId();
    const nextValue = moods.reduce((max, m) => Math.max(max, m.value ?? 0), 0) + 1;
    debouncedExecute(
      `INSERT INTO moods (id, user_id, label, color, value, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [id, userId, name, color, nextValue],
      id,
    );
  };

  const handleDelete = async (id: string) => {
    cancelExecute(id);
    cancelExecute(`mood-color:${id}`);
    cancelExecute(`mood-label:${id}`);
    await db.execute(`DELETE FROM moods WHERE id = ?`, [id]);
  };

  const handleUpdateColor = (id: string, color: string) => {
    debouncedExecute(`UPDATE moods SET color = ? WHERE id = ?`, [color, id], `mood-color:${id}`);
  };

  const handleRename = (id: string, label: string) => {
    debouncedExecute(`UPDATE moods SET label = ? WHERE id = ?`, [label, id], `mood-label:${id}`);
  };

  return (
    <ManageNamedColorItemsDialog
      title="Manage Moods"
      createLabel="Add a mood (as the new best)"
      emptyLabel="No moods yet."
      existingLabel="Your mood scale (worst → best)"
      placeholder="Mood label..."
      itemTypeLabel="mood"
      colors={MOOD_COLORS}
      defaultColor={MOOD_COLORS[0]}
      items={items}
      trigger={{
        icon: SmilePlus,
        label: "Moods",
      }}
      open={open}
      onOpenChange={onOpenChange}
      hideTrigger={hideTrigger}
      getDotClass={getActivityDotClass}
      getItemClass={(color) => ACTIVITY_CELL_CLASSES[color] ?? ACTIVITY_CELL_CLASSES.slate}
      onCreate={handleAdd}
      onDelete={handleDelete}
      onUpdateColor={handleUpdateColor}
      onRename={handleRename}
    >
      {children}
    </ManageNamedColorItemsDialog>
  );
}
