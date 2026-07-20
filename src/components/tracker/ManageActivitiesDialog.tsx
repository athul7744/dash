"use client";

import * as React from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { Timer } from "lucide-react";
import { ManageNamedColorItemsDialog, type ManagedColorDraft } from "@/components/ManageNamedColorItemsDialog";
import { getCurrentUserId } from "@/lib/shared/auth";
import { cancelExecute, debouncedExecute } from "@/lib/shared/debounced-update";
import {
  ACTIVITY_COLORS,
  ACTIVITY_CELL_CLASSES,
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  DEFAULT_ACTIVITY_CATEGORY,
  getActivityDotClass,
} from "@/lib/tracker/activities";
import { ActivityType } from "@/lib/powersync/AppSchema";

const CATEGORY_OPTIONS = ACTIVITY_CATEGORIES.map((value) => ({
  value,
  label: ACTIVITY_CATEGORY_LABELS[value],
}));

interface ManageActivitiesDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function ManageActivitiesDialog({ children, open, onOpenChange, hideTrigger = false }: ManageActivitiesDialogProps) {
  const db = usePowerSync();
  const { data: activities } = useQuery<ActivityType & { id: string }>(
    "SELECT * FROM activity_types ORDER BY created_at ASC"
  );

  const handleAdd = async ({ id, name, color, category }: ManagedColorDraft) => {
    const userId = await getCurrentUserId();
    debouncedExecute(
      `INSERT INTO activity_types (id, user_id, name, color, category, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [id, userId, name, color, category ?? DEFAULT_ACTIVITY_CATEGORY],
      id
    );
  };

  const handleDelete = async (id: string) => {
    cancelExecute(id);
    cancelExecute(`activity-color:${id}`);
    cancelExecute(`activity-category:${id}`);
    cancelExecute(`activity-name:${id}`);
    await db.execute(`DELETE FROM activity_types WHERE id = ?`, [id]);
  };

  const handleUpdateColor = (id: string, color: string) => {
    debouncedExecute(
      `UPDATE activity_types SET color = ? WHERE id = ?`,
      [color, id],
      `activity-color:${id}`
    );
  };

  const handleUpdateCategory = (id: string, category: string) => {
    debouncedExecute(
      `UPDATE activity_types SET category = ? WHERE id = ?`,
      [category, id],
      `activity-category:${id}`
    );
  };

  const handleRename = (id: string, name: string) => {
    debouncedExecute(
      `UPDATE activity_types SET name = ? WHERE id = ?`,
      [name, id],
      `activity-name:${id}`
    );
  };

  return (
    <ManageNamedColorItemsDialog
      title="Manage Activities"
      createLabel="Create New Activity"
      emptyLabel="No activities created yet."
      existingLabel="Existing Activities"
      placeholder="Activity name..."
      itemTypeLabel="activity"
      colors={ACTIVITY_COLORS}
      defaultColor={ACTIVITY_COLORS[0]}
      items={activities}
      trigger={{
        icon: Timer,
        label: "Activities",
        hoverClassName: "hover:text-teal-600 dark:hover:text-teal-400",
      }}
      open={open}
      onOpenChange={onOpenChange}
      hideTrigger={hideTrigger}
      getDotClass={getActivityDotClass}
      getItemClass={(color) => ACTIVITY_CELL_CLASSES[color] ?? ACTIVITY_CELL_CLASSES.teal}
      onCreate={handleAdd}
      onDelete={handleDelete}
      onUpdateColor={handleUpdateColor}
      onRename={handleRename}
      categoryOptions={CATEGORY_OPTIONS}
      defaultCategory={DEFAULT_ACTIVITY_CATEGORY}
      onUpdateCategory={handleUpdateCategory}
    >
      {children}
    </ManageNamedColorItemsDialog>
  );
}
