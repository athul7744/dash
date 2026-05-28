"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Globe,
  Hash,
  Plus,
  Smile,
  Trash2,
  Type,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
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
  parseCustomPropertyValues,
  updatePropertyDefinitionConfig,
} from "@/lib/notes/properties";
import { updateNotePageProperties } from "@/lib/notes/notes";
import type { JsonValue } from "@/lib/notes/notes";

import {
  NOTE_PAGE_EMOJI_OPTIONS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type PropertyDefinitionConfig,
  type PropertyType,
  type ResolvedPageProperty,
} from "./types";

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const PROPERTY_TYPE_ICONS: Record<PropertyType, typeof Type> = {
  text: Type,
  number: Hash,
  date: CalendarIcon,
  select: ChevronDown,
  checkbox: Check,
  url: Globe,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDefinitionConfig(raw: string | null | undefined): PropertyDefinitionConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (typeof parsed === "object" && parsed !== null) ? (parsed as PropertyDefinitionConfig) : {};
  } catch {
    return {};
  }
}

function resolveProperties(
  definitions: PropertyDefinitionRow[],
  customValues: Record<string, unknown>
): ResolvedPageProperty[] {
  const assignedIds = new Set(Object.keys(customValues));

  return definitions
    .filter((def) => assignedIds.has(def.id))
    .map((def) => ({
      definitionId: def.id,
      name: def.name ?? "",
      type: (def.type ?? "text") as PropertyType,
      config: parseDefinitionConfig(def.config),
      value: customValues[def.id] ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Custom Select Editor with search, dynamic option creation, and clear action
// ---------------------------------------------------------------------------

function SelectPropertyValueEditor({
  property,
  value,
  onChange,
}: {
  property: ResolvedPageProperty;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const options = property.config.options ?? [];

  const currentValue = typeof value === "string" ? value : "";

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const showCreateOption =
    search.trim() !== "" &&
    !options.some((opt) => opt.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (val: string) => {
    onChange(val || null);
    setOpen(false);
    setSearch("");
  };

  const handleCreateOption = async () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    const nextOptions = [...options, trimmed];
    await updatePropertyDefinitionConfig(property.definitionId, {
      ...property.config,
      options: nextOptions,
    });
    onChange(trimmed);
    setOpen(false);
    setSearch("");
  };

  const getOptionBadgeStyle = (text: string) => {
    const colors = [
      "bg-gray-100 text-gray-700 dark:bg-gray-800/80 dark:text-gray-300",
      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
      "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
      "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
    ];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-7 w-full items-center justify-start border-0 bg-transparent px-1.5 text-xs font-normal text-left shadow-none transition-colors rounded cursor-pointer",
          !currentValue && "text-muted-foreground/30"
        )}
      >
        {currentValue ? (
          <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", getOptionBadgeStyle(currentValue))}>
            {currentValue}
          </span>
        ) : (
          "Empty"
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <div className="space-y-1.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or create option..."
            className="h-7 text-xs px-2 focus-visible:ring-1 focus-visible:ring-ring border-muted/50"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (showCreateOption) {
                  handleCreateOption();
                } else if (filteredOptions.length > 0) {
                  handleSelect(filteredOptions[0]);
                }
              }
            }}
          />
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filteredOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleSelect(opt)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors text-left"
              >
                <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", getOptionBadgeStyle(opt))}>
                  {opt}
                </span>
                {currentValue === opt && (
                  <Check className="h-3 w-3 ml-auto text-muted-foreground" />
                )}
              </button>
            ))}
            {filteredOptions.length === 0 && !showCreateOption && (
              <p className="p-2 text-[11px] text-muted-foreground text-center">
                No options found
              </p>
            )}
            {showCreateOption && (
              <button
                type="button"
                onClick={handleCreateOption}
                className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors text-left"
              >
                <span className="text-muted-foreground/50">Create</span>
                <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium max-w-[120px] truncate", getOptionBadgeStyle(search.trim()))}>
                  {search.trim()}
                </span>
              </button>
            )}
            {currentValue && (
              <>
                <div className="h-px bg-border/40 my-1" />
                <button
                  type="button"
                  onClick={() => handleSelect("")}
                  className="flex w-full items-center rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/70 hover:text-destructive transition-colors text-left"
                >
                  Clear value
                </button>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Value editors
// ---------------------------------------------------------------------------

function PillValue({ value, onClick, placeholder = "Empty" }: { value: string | null; onClick: () => void; placeholder?: string }) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-7 w-full items-center justify-start bg-transparent px-1.5 text-xs text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors text-left"
      >
        {placeholder}
      </button>
    );
  }
  
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center justify-start bg-transparent text-left group/pill"
    >
      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/60 text-foreground group-hover/pill:bg-muted transition-colors truncate max-w-full">
        {value}
      </span>
    </button>
  );
}

function PropertyValueEditor({
  property,
  onChange,
}: {
  property: ResolvedPageProperty;
  onChange: (value: unknown) => void;
}) {
  const [localValue, setLocalValue] = useState(property.value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(property.value);
    }
  }, [property.value, isFocused]);

  const handleChange = (newValue: unknown) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  switch (property.type) {
    case "checkbox":
      return (
        <div className="flex items-center h-7 px-1.5">
          <button
            type="button"
            onClick={() => handleChange(!(localValue === true))}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              localValue === true
                ? "border-violet-500 bg-violet-500 text-white"
                : "border-muted-foreground/30 bg-transparent hover:border-muted-foreground/60"
            )}
            aria-label="Toggle checkbox"
          >
            {localValue === true ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
          </button>
        </div>
      );

    case "select":
      return (
        <SelectPropertyValueEditor
          property={property}
          value={localValue}
          onChange={handleChange}
        />
      );

    case "date": {
      const selectedDate = typeof localValue === "string" && localValue ? parseISO(localValue) : undefined;
      return (
        <Popover open={isFocused} onOpenChange={setIsFocused}>
          <PopoverTrigger
            className={cn(
              "flex h-7 w-full items-center justify-start border-0 bg-transparent text-left shadow-none transition-colors rounded cursor-pointer outline-none",
              !localValue ? "px-1.5 text-xs text-muted-foreground/30 hover:text-muted-foreground/50" : ""
            )}
          >
            {selectedDate ? (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/60 text-foreground hover:bg-muted transition-colors truncate max-w-full">
                {format(selectedDate, "MMM d, yyyy")}
              </span>
            ) : "Empty"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                const dateStr = date ? format(date, "yyyy-MM-dd") : null;
                handleChange(dateStr);
                setIsFocused(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      );
    }

    case "number":
      if (!isFocused) {
        return <PillValue value={typeof localValue === "number" ? String(localValue) : null} onClick={() => setIsFocused(true)} />;
      }
      return (
        <Input
          type="number"
          value={typeof localValue === "number" ? String(localValue) : ""}
          onChange={(e) => {
            const val = e.target.value;
            handleChange(val === "" ? null : Number(val));
          }}
          onBlur={() => setIsFocused(false)}
          autoFocus
          className="h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0 transition-colors rounded"
        />
      );

    case "url":
      if (!isFocused) {
        return (
          <div className="flex items-center gap-1 w-full">
            {typeof localValue === "string" && localValue && /^https?:\/\//i.test(localValue) && (
              <a
                href={localValue}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/50 hover:text-primary p-1 rounded hover:bg-muted transition-colors shrink-0"
                title="Open URL"
              >
                <Globe className="h-3 w-3" />
              </a>
            )}
            <PillValue value={typeof localValue === "string" ? localValue : null} onClick={() => setIsFocused(true)} />
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1 w-full">
          <Input
            type="url"
            value={typeof localValue === "string" ? localValue : ""}
            onChange={(e) => handleChange(e.target.value || null)}
            onBlur={() => setIsFocused(false)}
            autoFocus
            className="h-7 flex-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0 transition-colors rounded"
          />
        </div>
      );

    default: // text
      if (!isFocused) {
        return <PillValue value={typeof localValue === "string" ? localValue : null} onClick={() => setIsFocused(true)} />;
      }
      return (
        <Input
          type="text"
          value={typeof localValue === "string" ? localValue : ""}
          onChange={(e) => handleChange(e.target.value || null)}
          onBlur={() => setIsFocused(false)}
          autoFocus
          className="h-7 w-full border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0 transition-colors rounded"
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Property Row
// ---------------------------------------------------------------------------

function PropertyRow({
  property,
  onValueChange,
  onRemove,
}: {
  property: ResolvedPageProperty;
  onValueChange: (definitionId: string, value: unknown) => void;
  onRemove: (definitionId: string) => void;
}) {
  const Icon = PROPERTY_TYPE_ICONS[property.type] ?? Type;

  return (
    <div className="group flex items-center py-1">
      <div className="flex w-32 items-center gap-1.5 text-muted-foreground/70 select-none shrink-0">
        <Popover>
          <PopoverTrigger className="h-5 w-5 flex items-center justify-center hover:bg-muted rounded transition-colors text-muted-foreground">
            {property.config.icon ? (
              <span className="text-[14px] leading-none">{property.config.icon}</span>
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            )}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-8 gap-1">
              {NOTE_PAGE_EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    void updatePropertyDefinitionConfig(property.definitionId, {
                      ...property.config,
                      icon: emoji,
                    });
                  }}
                  className="flex size-8 items-center justify-center rounded-lg text-lg hover:bg-muted"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const nextConfig = { ...property.config };
                delete nextConfig.icon;
                void updatePropertyDefinitionConfig(property.definitionId, nextConfig);
              }}
              className="mt-2 flex h-7 w-full items-center justify-center rounded-lg text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          </PopoverContent>
        </Popover>
        <span className="truncate text-xs font-normal">{property.name}</span>
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <PropertyValueEditor
          property={property}
          onChange={(value) => onValueChange(property.definitionId, value)}
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(property.definitionId)}
        className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0 ml-2"
        aria-label={`Remove ${property.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add property popover
// ---------------------------------------------------------------------------

function AddPropertyPopover({
  definitions,
  assignedIds,
  onAssignExisting,
  onCreateNew,
}: {
  definitions: PropertyDefinitionRow[];
  assignedIds: Set<string>;
  onAssignExisting: (definitionId: string) => void;
  onCreateNew: (name: string, type: PropertyType, config?: PropertyDefinitionConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PropertyType>("text");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [selectOptionsText, setSelectOptionsText] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const unassigned = definitions.filter((def) => !assignedIds.has(def.id));

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const config: PropertyDefinitionConfig = {};
    if (newIcon) {
      config.icon = newIcon;
    }
    if (newType === "select") {
      const options = selectOptionsText
        .split(",")
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
      if (options.length > 0) {
        config.options = options;
      }
    }
    onCreateNew(trimmed, newType, config);
    setNewName("");
    setNewType("text");
    setNewIcon(null);
    setSelectOptionsText("");
    setShowCreate(false);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setShowCreate(false); }}>
      <PopoverTrigger
        className="inline-flex items-center justify-center h-5 w-5 rounded transition-colors text-muted-foreground/40 hover:bg-muted hover:text-foreground"
        aria-label="Add a property"
      >
        <Plus className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3" align="start">
        {!showCreate ? (
          <>
            {unassigned.length > 0 ? (
              <div className="space-y-0.5">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Existing properties
                </p>
                {unassigned.map((def) => {
                  const Icon = PROPERTY_TYPE_ICONS[(def.type as PropertyType) ?? "text"] ?? Type;
                  const config = parseDefinitionConfig(def.config);
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => {
                        onAssignExisting(def.id);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      {config.icon ? (
                        <span className="h-3.5 w-3.5 flex items-center justify-center text-[14px] leading-none">{config.icon}</span>
                      ) : (
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="truncate">{def.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{PROPERTY_TYPE_LABELS[(def.type as PropertyType) ?? "text"]}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Create new property
            </button>
          </>
        ) : (
          <div className="space-y-2.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              New property
            </p>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-transparent hover:bg-muted transition-colors shrink-0">
                  {newIcon ? (
                    <span className="text-[14px] leading-none">{newIcon}</span>
                  ) : (
                    <Smile className="h-4 w-4 text-muted-foreground/50" />
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="grid grid-cols-8 gap-1">
                    {NOTE_PAGE_EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setNewIcon(emoji)}
                        className="flex size-8 items-center justify-center rounded-lg text-lg hover:bg-muted"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setNewIcon(null)}
                    className="mt-2 flex h-7 w-full items-center justify-center rounded-lg text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Clear
                  </button>
                </PopoverContent>
              </Popover>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Property name"
                className="h-8 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
            </div>
            <Select value={newType} onValueChange={(val) => setNewType(val as PropertyType)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PROPERTY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newType === "select" && (
              <Input
                value={selectOptionsText}
                onChange={(e) => setSelectOptionsText(e.target.value)}
                placeholder="Options (comma-separated)"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
            )}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreate(false)}
                className="h-7 px-2.5 text-xs"
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="h-7 px-3 text-xs"
              >
                Create
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NotePageProperties({
  pageId,
  pageProperties,
  shouldAnimate,
}: {
  pageId: string;
  pageProperties: Record<string, unknown>;
  shouldAnimate: boolean;
}) {
  const { definitions: dbDefinitions } = usePropertyDefinitions();
  const [isExpanded, setIsExpanded] = useState(false);

  // Optimistic definitions overlay for newly created properties
  const [optimisticDefs, setOptimisticDefs] = useState<PropertyDefinitionRow[]>([]);
  const definitions = useMemo(() => {
    if (optimisticDefs.length === 0) return dbDefinitions;
    const dbIds = new Set(dbDefinitions.map((d) => d.id));
    // Keep only optimistic defs not yet in DB
    const pending = optimisticDefs.filter((d) => !dbIds.has(d.id));
    return [...dbDefinitions, ...pending];
  }, [dbDefinitions, optimisticDefs]);

  // Clear optimistic defs once DB catches up
  useEffect(() => {
    if (optimisticDefs.length === 0) return;
    const dbIds = new Set(dbDefinitions.map((d) => d.id));
    const remaining = optimisticDefs.filter((d) => !dbIds.has(d.id));
    if (remaining.length !== optimisticDefs.length) {
      setOptimisticDefs(remaining);
    }
  }, [dbDefinitions, optimisticDefs]);

  const pagePropertiesRef = useRef(pageProperties);
  pagePropertiesRef.current = pageProperties;

  const dbCustomValues = useMemo(
    () => parseCustomPropertyValues(pageProperties),
    [pageProperties]
  );

  // Optimistic overlay: immediately reflects user actions before DB write flushes
  const [optimisticCustomValues, setOptimisticCustomValues] = useState<Record<string, unknown> | null>(null);
  const customValues = optimisticCustomValues ?? dbCustomValues;

  // Clear optimistic overlay when DB catches up
  useEffect(() => {
    setOptimisticCustomValues(null);
  }, [dbCustomValues]);

  const customValuesRef = useRef(customValues);
  customValuesRef.current = customValues;

  const assignedIds = useMemo(
    () => new Set(Object.keys(customValues)),
    [customValues]
  );

  const resolvedProperties = useMemo(
    () => resolveProperties(definitions, customValues),
    [definitions, customValues]
  );

  const persistCustomValues = useCallback(
    (nextCustom: Record<string, unknown>) => {
      setOptimisticCustomValues(nextCustom);
      updateNotePageProperties(pageId, {
        ...(pagePropertiesRef.current as Record<string, JsonValue>),
        custom: nextCustom as Record<string, JsonValue>,
      });
    },
    [pageId]
  );

  const handleValueChange = useCallback(
    (definitionId: string, value: unknown) => {
      const next = { ...customValuesRef.current, [definitionId]: value };
      persistCustomValues(next);
    },
    [persistCustomValues]
  );

  const handleRemoveProperty = useCallback(
    (definitionId: string) => {
      const next = { ...customValuesRef.current };
      delete next[definitionId];
      persistCustomValues(next);
    },
    [persistCustomValues]
  );

  const handleAssignExisting = useCallback(
    (definitionId: string) => {
      const def = definitions.find((d) => d.id === definitionId);
      if (!def) return;

      const defaultValue =
        (def.type as PropertyType) === "checkbox" ? false : null;
      const next = { ...customValuesRef.current, [definitionId]: defaultValue };
      persistCustomValues(next);
    },
    [definitions, persistCustomValues]
  );

  const handleCreateNew = useCallback(
    async (name: string, type: PropertyType, config?: PropertyDefinitionConfig) => {
      const defId = await createPropertyDefinition(name, type, config);

      // Optimistically surface the definition immediately
      setOptimisticDefs((prev) => [
        ...prev,
        {
          id: defId,
          user_id: "",
          name,
          type,
          config: JSON.stringify(config ?? {}),
          created_at: new Date().toISOString(),
        } as PropertyDefinitionRow,
      ]);

      const defaultValue = type === "checkbox" ? false : null;
      const next = { ...customValuesRef.current, [defId]: defaultValue };
      persistCustomValues(next);
    },
    [persistCustomValues]
  );

  return (
    <div
      className={`col-span-2 px-3 sm:col-start-2 sm:col-span-2 sm:px-0 ${shouldAnimate ? "animate-stagger" : ""}`}
    >
      <div className="flex items-center justify-between group/header">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground/60 hover:text-muted-foreground transition-colors select-none"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground/30",
              !isExpanded && "-rotate-90"
            )}
          />
          Properties
        </button>

        <div className="opacity-0 group-hover/header:opacity-100 transition-opacity flex items-center md:focus-within:opacity-100 md:[&:has(:focus-visible)]:opacity-100 max-md:opacity-100">
          <AddPropertyPopover
            definitions={definitions}
            assignedIds={assignedIds}
            onAssignExisting={handleAssignExisting}
            onCreateNew={handleCreateNew}
          />
        </div>
      </div>

      {resolvedProperties.length > 0 ? (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-in-out"
          style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="space-y-[1px] pl-3 border-l border-border/10 ml-[5px]">
              {resolvedProperties.map((prop) => (
                <PropertyRow
                  key={prop.definitionId}
                  property={prop}
                  onValueChange={handleValueChange}
                  onRemove={handleRemoveProperty}
                />
              ))}
            </div>
          </div>
        </div>
      ) : isExpanded ? (
        <p className="pl-6 py-1.5 text-[11px] text-muted-foreground/50">
          No properties assigned. Use + to add one.
        </p>
      ) : null}
    </div>
  );
}
