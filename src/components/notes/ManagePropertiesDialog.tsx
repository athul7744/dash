"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Check, ChevronDown, Columns3, Globe, Hash, Plus, Trash2, Type, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";

import {
  usePropertyDefinitions,
  type PropertyDefinitionRow,
} from "@/hooks/use-property-definitions";
import {
  createPropertyDefinition,
  deletePropertyDefinition,
  updatePropertyDefinitionName,
  updatePropertyDefinitionConfig,
} from "@/lib/notes/properties";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type PropertyType,
  type PropertyDefinitionConfig,
} from "@/components/notes/page/types";
import { IconPicker } from "@/components/notes/IconPicker";
import { SpriteIcon } from "@/components/notes/SpriteIcon";

const PROPERTY_TYPE_ICONS: Record<PropertyType, typeof Type> = {
  text: Type,
  number: Hash,
  date: CalendarIcon,
  select: ChevronDown,
  checkbox: Check,
  url: Globe,
};

interface ManagePropertiesDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

/* ─── Emoji Picker Inline ─── */
function EmojiPicker({
  value,
  onChange,
  propertyType,
}: {
  value: string | undefined;
  onChange: (emoji: string | undefined) => void;
  propertyType: PropertyType;
}) {
  const [open, setOpen] = React.useState(false);
  const FallbackIcon = PROPERTY_TYPE_ICONS[propertyType] ?? Type;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex size-7 shrink-0 items-center justify-center rounded-md text-base leading-none transition-colors hover:bg-muted">
        {value ? <SpriteIcon name={value} size={14} /> : <FallbackIcon className="h-3.5 w-3.5 text-muted-foreground/60" />}
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-2xl p-2" side="bottom" align="start">
        <IconPicker
          value={value}
          onSelect={(icon) => { onChange(icon); setOpen(false); }}
          onClear={() => { onChange(undefined); setOpen(false); }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ─── Select Options Editor ─── */
function SelectOptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const [newOption, setNewOption] = React.useState("");

  const handleAdd = () => {
    const trimmed = newOption.trim();
    if (!trimmed || options.includes(trimmed)) return;
    onChange([...options, trimmed]);
    setNewOption("");
  };

  const handleRemove = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-1.5 space-y-1.5 border-l-2 border-muted pl-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Options</p>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {options.map((opt, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
            >
              {opt}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                aria-label={`Remove ${opt}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          placeholder="New option..."
          className="h-6 flex-1 text-[11px]"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={handleAdd}
          disabled={!newOption.trim()}
          aria-label="Add option"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Property Row ─── */
function PropertyRow({
  definition,
  onDelete,
  onRename,
  onUpdateConfig,
}: {
  definition: PropertyDefinitionRow;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onUpdateConfig: (id: string, config: PropertyDefinitionConfig) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(definition.name ?? "");
  const [showOptions, setShowOptions] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const config: PropertyDefinitionConfig = React.useMemo(() => {
    try {
      return typeof definition.config === "string"
        ? JSON.parse(definition.config)
        : definition.config ?? {};
    } catch {
      return {};
    }
  }, [definition.config]);

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== definition.name) {
      onRename(definition.id, trimmed);
    } else {
      setDraft(definition.name ?? "");
    }
  };

  const handleEmojiChange = (emoji: string | undefined) => {
    const newConfig = { ...config, icon: emoji };
    if (!emoji) delete newConfig.icon;
    onUpdateConfig(definition.id, newConfig);
  };

  const handleOptionsChange = (options: string[]) => {
    onUpdateConfig(definition.id, { ...config, options });
  };

  const isSelect = definition.type === "select";

  return (
    <div className="rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
      <div className="group flex items-center gap-2">
        <EmojiPicker value={config.icon} onChange={handleEmojiChange} propertyType={definition.type as PropertyType} />

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleBlur();
                if (e.key === "Escape") { setIsEditing(false); setDraft(definition.name ?? ""); }
              }}
              className="h-7 text-[13px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="block w-full truncate text-left text-[13px] font-medium text-foreground"
            >
              {definition.name || "Untitled"}
            </button>
          )}
        </div>

        {isSelect && (
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {config.options?.length ?? 0} option{(config.options?.length ?? 0) === 1 ? "" : "s"}
          </button>
        )}

        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {PROPERTY_TYPE_LABELS[definition.type as PropertyType] ?? definition.type}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          onClick={() => setIsDeleteOpen(true)}
          aria-label={`Delete ${definition.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{definition.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this property definition from all pages.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDelete(definition.id)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {isSelect && showOptions && (
        <SelectOptionsEditor options={config.options ?? []} onChange={handleOptionsChange} />
      )}
    </div>
  );
}

export function ManagePropertiesDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
}: ManagePropertiesDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const { definitions: dbDefinitions } = usePropertyDefinitions();

  // Optimistic state overlays
  const [optimisticAdds, setOptimisticAdds] = React.useState<PropertyDefinitionRow[]>([]);
  const [optimisticDeletes, setOptimisticDeletes] = React.useState<Set<string>>(new Set());
  const [optimisticEdits, setOptimisticEdits] = React.useState<Map<string, Partial<PropertyDefinitionRow>>>(new Map());

  // Merge optimistic state with DB definitions
  const definitions = React.useMemo(() => {
    const dbIds = new Set(dbDefinitions.map((d) => d.id));

    // Apply edits to existing definitions, filter out deleted
    const edited = dbDefinitions
      .filter((d) => !optimisticDeletes.has(d.id))
      .map((d) => {
        const edits = optimisticEdits.get(d.id);
        return edits ? { ...d, ...edits } : d;
      });

    // Add optimistic creates not yet in DB
    const pending = optimisticAdds.filter((d) => !dbIds.has(d.id));

    return [...edited, ...pending];
  }, [dbDefinitions, optimisticAdds, optimisticDeletes, optimisticEdits]);

  // Clear optimistic state as DB catches up
  React.useEffect(() => {
    const dbIds = new Set(dbDefinitions.map((d) => d.id));
    // Clear adds that are now in DB
    setOptimisticAdds((prev) => {
      const remaining = prev.filter((d) => !dbIds.has(d.id));
      return remaining.length === prev.length ? prev : remaining;
    });
    // Clear deletes that are no longer in DB
    setOptimisticDeletes((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        if (!dbIds.has(id)) { next.delete(id); changed = true; }
      }
      return changed ? next : prev;
    });
    // Clear edits for rows that now match
    setOptimisticEdits((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const [id, edits] of prev) {
        const dbRow = dbDefinitions.find((d) => d.id === id);
        if (!dbRow) { next.delete(id); continue; }
        const nameMatch = !edits.name || dbRow.name === edits.name;
        const configMatch = !edits.config || dbRow.config === edits.config;
        if (nameMatch && configMatch) next.delete(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [dbDefinitions]);

  const [newName, setNewName] = React.useState("");
  const [newType, setNewType] = React.useState<PropertyType>("text");
  const newNameRef = React.useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const type = newType;
    setNewName("");
    setNewType("text");

    const id = await createPropertyDefinition(trimmed, type);
    setOptimisticAdds((prev) => [
      ...prev,
      { id, user_id: "", name: trimmed, type, config: "{}", created_at: new Date().toISOString() } as PropertyDefinitionRow,
    ]);
  };

  const handleDelete = (id: string) => {
    setOptimisticDeletes((prev) => new Set(prev).add(id));
    void deletePropertyDefinition(id);
  };

  const handleRename = (id: string, name: string) => {
    setOptimisticEdits((prev) => {
      const next = new Map(prev);
      next.set(id, { ...(prev.get(id) ?? {}), name });
      return next;
    });
    void updatePropertyDefinitionName(id, name);
  };

  const handleUpdateConfig = (id: string, config: PropertyDefinitionConfig) => {
    setOptimisticEdits((prev) => {
      const next = new Map(prev);
      next.set(id, { ...(prev.get(id) ?? {}), config: JSON.stringify(config) });
      return next;
    });
    void updatePropertyDefinitionConfig(id, config);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium transition-colors hover:bg-accent hover:text-violet-600 dark:hover:text-violet-400">
          <Columns3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Properties</span>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Properties</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new property */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Create New Property
            </p>
            <div className="flex items-center gap-2">
              <Input
                ref={newNameRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
                placeholder="Property name..."
                className="h-8 flex-1 text-[13px]"
              />
              <Select value={newType} onValueChange={(v) => setNewType(v as PropertyType)}>
                <SelectTrigger className="h-8 w-28 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="text-[12px]">
                      {PROPERTY_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={() => void handleCreate()}
                disabled={!newName.trim()}
                aria-label="Create property"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Existing properties */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Existing Properties
            </p>
            {definitions.length === 0 ? (
              <p className="px-2 py-4 text-center text-[13px] text-muted-foreground">
                No properties created yet.
              </p>
            ) : (
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {definitions.map((def) => (
                  <PropertyRow
                    key={def.id}
                    definition={def}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    onUpdateConfig={handleUpdateConfig}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
