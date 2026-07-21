"use client";

import * as React from "react";
import { Plus, Trash2, type LucideIcon } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";
import { HEADER_ACTION_BASE } from "@/lib/shared/apps";

type ManagedColorItem = {
  id: string;
  name: string | null;
  color?: string | null;
  category?: string | null;
};

export type ManagedColorDraft = {
  id: string;
  name: string;
  color: string;
  category?: string;
};

type ManagedColorOverlay = {
  name?: string | null;
  color?: string | null;
  category?: string | null;
  pendingCreate?: boolean;
};

type TriggerConfig = {
  icon: LucideIcon;
  label: string;
  /** Optional accent hover for the app's ONE primary action; omit to stay neutral. */
  hoverClassName?: string;
};

export type CategoryOption = { value: string; label: string };

type ManageNamedColorItemsDialogProps<TItem extends ManagedColorItem> = {
  title: string;
  createLabel: string;
  emptyLabel: string;
  existingLabel: string;
  placeholder: string;
  itemTypeLabel: string;
  colors: readonly string[];
  defaultColor: string;
  items: TItem[];
  trigger: TriggerConfig;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  getDotClass: (color: string) => string;
  getItemClass: (color: string) => string;
  onCreate: (item: ManagedColorDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdateColor: (id: string, color: string) => void | Promise<void>;
  /** When provided, item names become inline-editable (rename on Enter/blur). */
  onRename?: (id: string, name: string) => void | Promise<void>;
  /** When provided, each row gets a category dropdown and the create form a picker. */
  categoryOptions?: readonly CategoryOption[];
  defaultCategory?: string;
  onUpdateCategory?: (id: string, category: string) => void | Promise<void>;
};

function ItemRow<TItem extends ManagedColorItem>({
  item,
  colors,
  getDotClass,
  getItemClass,
  onDelete,
  onUpdateColor,
  onRename,
  categoryOptions,
  onUpdateCategory,
}: {
  item: TItem | ManagedColorDraft;
  colors: readonly string[];
  getDotClass: (color: string) => string;
  getItemClass: (color: string) => string;
  onDelete: (id: string) => Promise<void>;
  onUpdateColor: (id: string, color: string) => void | Promise<void>;
  onRename?: (id: string, name: string) => void | Promise<void>;
  categoryOptions?: readonly CategoryOption[];
  onUpdateCategory?: (id: string, category: string) => void | Promise<void>;
}) {
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(item.name ?? "");
  const nameFocusedRef = React.useRef(false);
  const resolvedColor = item.color ?? null;
  const fallbackColor = colors[0];

  // Keep the input in sync with synced/optimistic name changes while unfocused.
  React.useEffect(() => {
    if (!nameFocusedRef.current) setNameDraft(item.name ?? "");
  }, [item.name]);

  const commitName = () => {
    nameFocusedRef.current = false;
    const trimmed = nameDraft.trim();
    if (onRename && trimmed && trimmed !== (item.name ?? "")) onRename(item.id, trimmed);
    else setNameDraft(item.name ?? "");
  };

  return (
    <div className="group flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <Popover open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
          <PopoverTrigger
            className={cn(
              "h-4 w-4 cursor-pointer rounded-full transition-transform hover:scale-110 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              getDotClass(resolvedColor || fallbackColor)
            )}
            title="Change color"
          />
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="flex flex-wrap gap-2">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    onUpdateColor(item.id, color);
                    setIsColorPickerOpen(false);
                  }}
                  className={cn(
                    "h-5 w-5 cursor-pointer rounded-full transition-transform hover:scale-110",
                    getDotClass(color),
                    resolvedColor === color ? "scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
                  )}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {onRename ? (
          <input
            value={nameDraft}
            maxLength={30}
            onFocus={() => {
              nameFocusedRef.current = true;
            }}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setNameDraft(item.name ?? "");
                event.currentTarget.blur();
              }
            }}
            className={cn(
              "min-w-0 flex-1 rounded-sm px-2 py-0.5 text-xs font-medium outline-none focus:ring-1 focus:ring-ring",
              getItemClass(resolvedColor || fallbackColor),
            )}
          />
        ) : (
          <span className={cn("rounded-sm px-2 py-0.5 text-xs font-medium", getItemClass(resolvedColor || fallbackColor))}>
            {item.name ?? ""}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {categoryOptions && onUpdateCategory && (
          <Select
            value={item.category ?? categoryOptions[0]?.value ?? ""}
            onValueChange={(v: string | null) => v && onUpdateCategory(item.id, v)}
          >
            <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs text-muted-foreground">
              <span>
                {categoryOptions.find((o) => o.value === (item.category ?? categoryOptions[0]?.value))?.label ??
                  (item.category ?? "")}
              </span>
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
          onClick={() => setIsDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{item.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this item. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void onDelete(item.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ManageNamedColorItemsDialog<TItem extends ManagedColorItem>({
  title,
  createLabel,
  emptyLabel,
  existingLabel,
  placeholder,
  itemTypeLabel,
  colors,
  defaultColor,
  items,
  trigger,
  children,
  open,
  onOpenChange,
  hideTrigger = false,
  getDotClass,
  getItemClass,
  onCreate,
  onDelete,
  onUpdateColor,
  onRename,
  categoryOptions,
  defaultCategory,
  onUpdateCategory,
}: ManageNamedColorItemsDialogProps<TItem>) {
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState(defaultColor);
  const [newCategory, setNewCategory] = React.useState(defaultCategory ?? categoryOptions?.[0]?.value ?? "");
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [overlays, setOverlays] = React.useState<Map<string, ManagedColorOverlay>>(new Map());
  const TriggerIcon = trigger.icon;
  const resolvedOpen = open ?? internalOpen;

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  // Reset the create form's color when the default changes, and its name each
  // time the dialog opens — done at render time (guarded) rather than in an
  // effect, so there's no cascading-render pass.
  const [prevDefaultColor, setPrevDefaultColor] = React.useState(defaultColor);
  if (prevDefaultColor !== defaultColor) {
    setPrevDefaultColor(defaultColor);
    setNewColor(defaultColor);
  }
  const [prevOpen, setPrevOpen] = React.useState(resolvedOpen);
  if (prevOpen !== resolvedOpen) {
    setPrevOpen(resolvedOpen);
    if (resolvedOpen) setNewName("");
  }

  // Reconcile optimistic overlays against freshly-persisted items when the
  // items array identity changes (again at render time, not via an effect).
  const [reconciledItems, setReconciledItems] = React.useState(items);
  if (reconciledItems !== items) {
    setReconciledItems(items);
    setOverlays((prev) => {
      let didChange = false;
      const next = new Map(prev);

      items.forEach((item) => {
        const existingOverlay = next.get(item.id);
        if (!existingOverlay) return;

        const persistedName = item.name ?? null;
        const persistedColor = item.color ?? null;
        const persistedCategory = item.category ?? null;
        const updatedOverlay = { ...existingOverlay };

        if (updatedOverlay.name === persistedName) {
          delete updatedOverlay.name;
        }

        if (updatedOverlay.color === persistedColor) {
          delete updatedOverlay.color;
        }

        if (updatedOverlay.category === persistedCategory) {
          delete updatedOverlay.category;
        }

        if (
          updatedOverlay.pendingCreate &&
          updatedOverlay.name === undefined &&
          updatedOverlay.color === undefined &&
          updatedOverlay.category === undefined
        ) {
          delete updatedOverlay.pendingCreate;
        }

        if (
          updatedOverlay.name === undefined &&
          updatedOverlay.color === undefined &&
          updatedOverlay.category === undefined &&
          !updatedOverlay.pendingCreate
        ) {
          next.delete(item.id);
          didChange = true;
          return;
        }

        if (
          updatedOverlay.name !== existingOverlay.name ||
          updatedOverlay.color !== existingOverlay.color ||
          updatedOverlay.category !== existingOverlay.category ||
          updatedOverlay.pendingCreate !== existingOverlay.pendingCreate
        ) {
          next.set(item.id, updatedOverlay);
          didChange = true;
        }
      });

      return didChange ? next : prev;
    });
  }

  const visibleItems = React.useMemo(
    () => {
      const persistedIds = new Set(items.map((item) => item.id));
      const optimisticItems = Array.from(overlays.entries())
        .filter(([id, overlay]) => overlay.pendingCreate && !persistedIds.has(id))
        .map(([id, overlay]) => ({
          id,
          name: overlay.name ?? "",
          color: overlay.color ?? defaultColor,
          category: overlay.category ?? defaultCategory ?? null,
        }));

      const mergedItems = [
        ...optimisticItems,
        ...items.map((item) => {
          const overlay = overlays.get(item.id);

          return {
            ...item,
            name: overlay?.name ?? item.name ?? null,
            color: overlay?.color ?? item.color ?? null,
            category: overlay?.category ?? item.category ?? null,
          };
        }),
      ];

      const uniqueItems = new Map<string, (typeof mergedItems)[number]>();
      mergedItems.forEach((item) => {
        if (!uniqueItems.has(item.id)) {
          uniqueItems.set(item.id, item);
        }
      });

      return Array.from(uniqueItems.values());
    },
    [defaultColor, defaultCategory, items, overlays]
  );

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    const selectedColor = newColor;
    const selectedCategory = categoryOptions ? newCategory : undefined;
    const id = uuidv4();
    setNewName("");
    setNewColor(colors[Math.floor(Math.random() * colors.length)] ?? defaultColor);

    setOverlays((prev) => {
      const next = new Map(prev);
      next.set(id, {
        name: trimmedName,
        color: selectedColor,
        category: selectedCategory ?? null,
        pendingCreate: true,
      });
      return next;
    });

    void onCreate({ id, name: trimmedName, color: selectedColor, category: selectedCategory }).catch(() => {
      setOverlays((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });
  };

  const handleDelete = async (id: string) => {
    setOverlays((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    await onDelete(id);
  };

  const handleUpdateColor = (id: string, color: string) => {
    setOverlays((prev) => {
      const next = new Map(prev);
      const existingOverlay = next.get(id) ?? {};
      next.set(id, {
        ...existingOverlay,
        color,
      });
      return next;
    });

    void onUpdateColor(id, color);
  };

  const handleUpdateCategory = (id: string, category: string) => {
    setOverlays((prev) => {
      const next = new Map(prev);
      const existingOverlay = next.get(id) ?? {};
      next.set(id, { ...existingOverlay, category });
      return next;
    });

    void onUpdateCategory?.(id, category);
  };

  const handleRename = (id: string, name: string) => {
    setOverlays((prev) => {
      const next = new Map(prev);
      const existingOverlay = next.get(id) ?? {};
      next.set(id, { ...existingOverlay, name });
      return next;
    });

    void onRename?.(id, name);
  };

  return (
    <Dialog open={resolvedOpen} onOpenChange={handleOpenChange}>
      {!hideTrigger && (children ? (
        <DialogTrigger className="w-full">
          {children}
        </DialogTrigger>
      ) : (
        <DialogTrigger className={cn(HEADER_ACTION_BASE, trigger.hoverClassName ?? "hover:text-foreground")}>
          <TriggerIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{trigger.label}</span>
        </DialogTrigger>
      ))}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${itemTypeLabel}Name`}>{createLabel}</Label>
              <div className="flex gap-2">
                <input
                  autoFocus
                  id={`${itemTypeLabel}Name`}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={placeholder}
                  maxLength={30}
                  className="h-8 w-full min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50"
                />
                <Button type="submit" disabled={!newName.trim()}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="mt-1 flex flex-wrap gap-2">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  className={cn(
                    "h-6 w-6 cursor-pointer rounded-full transition-transform hover:scale-110",
                    getDotClass(color),
                    newColor === color ? "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                  )}
                  aria-label={`Select ${itemTypeLabel} color ${color}`}
                />
              ))}
            </div>

            {categoryOptions && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={newCategory} onValueChange={(v: string | null) => v && setNewCategory(v)}>
                  <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs">
                    <span>{categoryOptions.find((o) => o.value === newCategory)?.label ?? newCategory}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form>

          <div className="border-t pt-4">
            <Label className="mb-3 block text-muted-foreground">{existingLabel}</Label>
            <div className="flex max-h-[250px] flex-col gap-2 overflow-y-auto pr-1">
              {visibleItems.length === 0 ? (
                <p className="py-4 text-center text-sm italic text-muted-foreground">{emptyLabel}</p>
              ) : (
                visibleItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    colors={colors}
                    getDotClass={getDotClass}
                    getItemClass={getItemClass}
                    onDelete={handleDelete}
                    onUpdateColor={handleUpdateColor}
                    onRename={onRename ? handleRename : undefined}
                    categoryOptions={categoryOptions}
                    onUpdateCategory={onUpdateCategory ? handleUpdateCategory : undefined}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}