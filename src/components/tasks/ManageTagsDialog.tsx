import * as React from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { Tag as TagIcon } from "lucide-react";
import { ManageNamedColorItemsDialog, type ManagedColorDraft } from "@/components/ManageNamedColorItemsDialog";
import { Tag } from "@/lib/powersync/AppSchema";
import { cancelExecute, debouncedExecute } from "@/lib/shared/debounced-update";
import { TAG_COLORS, getTagColorClasses, getTagDotClass } from "@/lib/tasks/colors";
import { createTag } from "@/lib/tasks/tags";
import { deleteTagLinks } from "@/lib/tags/entity-tags";

interface ManageTagsDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function ManageTagsDialog({ children, open, onOpenChange, hideTrigger = false }: ManageTagsDialogProps) {
  const db = usePowerSync();
  const { data: tags } = useQuery<Tag>("SELECT * FROM tags ORDER BY name ASC");

  const handleDeleteTag = async (id: string) => {
    cancelExecute(id);
    cancelExecute(`tag-color:${id}`);
    await db.execute(`DELETE FROM tags WHERE id = ?`, [id]);
    // Drop the tag's memberships too (the server FK also cascades).
    await deleteTagLinks(id);
  };

  const handleCreateTag = async ({ id, name, color }: ManagedColorDraft) => {
    await createTag(name, color, undefined, id);
  };

  const handleUpdateTagColor = (id: string, color: string) => {
    debouncedExecute(
      `UPDATE tags SET color = ? WHERE id = ?`,
      [color, id],
      `tag-color:${id}`
    );
  };

  return (
    <ManageNamedColorItemsDialog
      title="Manage Tags"
      createLabel="Create New Tag"
      emptyLabel="No tags created yet."
      existingLabel="Existing Tags"
      placeholder="Tag name..."
      itemTypeLabel="tag"
      colors={TAG_COLORS}
      defaultColor={TAG_COLORS[0]}
      items={tags}
      trigger={{
        icon: TagIcon,
        label: "Tags",
      }}
      open={open}
      onOpenChange={onOpenChange}
      hideTrigger={hideTrigger}
      getDotClass={getTagDotClass}
      getItemClass={(color) => getTagColorClasses(color)}
      onCreate={handleCreateTag}
      onDelete={handleDeleteTag}
      onUpdateColor={handleUpdateTagColor}
    >
      {children}
    </ManageNamedColorItemsDialog>
  );
}
