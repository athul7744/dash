"use client";

import { useState } from "react";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import { getTagColorClasses, getTagDotClass } from "@/lib/tasks/colors";
import { SpriteIcon } from "@/components/notes/SpriteIcon";
import type { PropertyDefinitionRow } from "@/hooks/use-property-definitions";
import type { Tag as TagRecord } from "@/lib/powersync/AppSchema";
import type { QueryFilterCondition, QueryFilterOperator } from "@/lib/notes/query-block";
import { BUILT_IN_PROPERTIES, OPERATORS_BY_TYPE } from "@/lib/notes/query-block";
import type { PropertyType } from "@/components/notes/page/types";
import { getPropertyType, parseDuration } from "./query-block-sql";
import { PROPERTY_TYPE_ICONS, getPropertyIcon, getPropertyCustomIcon, getOptionBadgeStyle } from "./query-block-helpers";

// --- Property selector popover ---
function PropertySelector({
  propertyId,
  definitions,
  onChange,
}: {
  propertyId: string;
  definitions: PropertyDefinitionRow[];
  onChange: (propertyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const allProperties = [
    ...BUILT_IN_PROPERTIES,
    ...definitions.map((d) => ({ id: d.id, name: d.name, type: d.type })),
  ];
  const current = allProperties.find((p) => p.id === propertyId);
  const customIcon = getPropertyCustomIcon(propertyId, definitions);
  const Icon = getPropertyIcon(propertyId, definitions);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 text-xs font-medium shadow-xs hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {customIcon ? (
          <SpriteIcon name={customIcon} size={13} className="shrink-0" />
        ) : (
          <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="truncate max-w-[80px]">{current?.name ?? "Property"}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {allProperties.map((prop) => {
            const propCustomIcon = getPropertyCustomIcon(prop.id, definitions);
            const PropIcon = PROPERTY_TYPE_ICONS[(prop.type as PropertyType | "title" | "date_meta")] ?? PROPERTY_TYPE_ICONS.text;
            return (
              <button
                key={prop.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors text-left hover:bg-muted/70",
                  prop.id === propertyId && "bg-accent"
                )}
                onClick={() => { onChange(prop.id); setOpen(false); }}
              >
                {propCustomIcon ? (
                  <SpriteIcon name={propCustomIcon} size={14} className="shrink-0" />
                ) : (
                  <PropIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">{prop.name}</span>
                {prop.id === propertyId && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Operator selector ---
function OperatorSelector({
  operator,
  propType,
  onChange,
}: {
  operator: QueryFilterOperator;
  propType: PropertyType | "title" | "date_meta" | "tags";
  onChange: (op: QueryFilterOperator) => void;
}) {
  const [open, setOpen] = useState(false);
  const operators = OPERATORS_BY_TYPE[propType] ?? OPERATORS_BY_TYPE.text;
  const current = operators.find((op) => op.value === operator);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background px-2 text-xs shadow-xs hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <span className="text-muted-foreground">{current?.label ?? operator}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {operators.map((op) => (
            <button
              key={op.value}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors text-left hover:bg-muted/70",
                op.value === operator && "bg-accent"
              )}
              onClick={() => { onChange(op.value); setOpen(false); }}
            >
              <span>{op.label}</span>
              {op.value === operator && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Contextual value editors ---
function FilterValueEditor({
  filter,
  propType,
  definitions,
  allTags,
  onChange,
}: {
  filter: QueryFilterCondition;
  propType: PropertyType | "title" | "date_meta" | "tags";
  definitions: PropertyDefinitionRow[];
  allTags: (TagRecord & { id: string })[];
  onChange: (value: unknown) => void;
}) {
  const stringValue = typeof filter.value === "string" ? filter.value : filter.value != null ? String(filter.value) : "";

  if (propType === "date" || propType === "date_meta") {
    if (filter.operator === "is_within") {
      return <DurationFilterValue value={stringValue} onChange={onChange} />;
    }
    return <DateFilterValue value={stringValue} onChange={onChange} />;
  }

  if (propType === "select") {
    const def = definitions.find((d) => d.id === filter.propertyId);
    const options: string[] = def ? (JSON.parse(def.config || "{}").options ?? []) : [];
    return <SelectFilterValue value={stringValue} options={options} onChange={onChange} />;
  }

  if (propType === "checkbox") return null;

  if (propType === "tags") {
    const needsValue = !["is_empty", "is_not_empty"].includes(filter.operator);
    if (!needsValue) return null;
    const selectedIds = Array.isArray(filter.value) ? filter.value as string[] : [];
    return <TagsFilterValue value={selectedIds} onChange={onChange} allTags={allTags} />;
  }

  if (propType === "number") {
    return (
      <Input
        type="number"
        className="h-7 w-20 px-2 text-xs"
        value={stringValue}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <Input
      type="text"
      className="h-7 w-28 px-2 text-xs"
      value={stringValue}
      placeholder="value"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// --- Duration value ---
const DURATION_UNITS = [
  { value: "d", label: "days" },
  { value: "w", label: "weeks" },
  { value: "m", label: "months" },
  { value: "y", label: "years" },
] as const;

function DurationFilterValue({ value, onChange }: { value: string; onChange: (v: unknown) => void }) {
  const parsed = parseDuration(value);
  const amount = parsed?.amount ?? 7;
  const unit = parsed?.unit ?? "d";

  const handleChange = (newAmount: number, newUnit: string) => {
    const clamped = Math.max(1, newAmount);
    onChange(`${clamped}${newUnit}`);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        className="h-7 w-14 px-2 text-xs"
        value={amount}
        min={1}
        onChange={(e) => handleChange(parseInt(e.target.value, 10) || 1, unit)}
      />
      <Popover>
        <PopoverTrigger className="flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background px-2 text-xs shadow-xs hover:bg-muted/50 transition-colors cursor-pointer">
          <span>{DURATION_UNITS.find((u) => u.value === unit)?.label ?? "days"}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
        </PopoverTrigger>
        <PopoverContent className="w-28 p-1" align="start">
          {DURATION_UNITS.map((u) => (
            <button
              key={u.value}
              className={cn(
                "flex w-full items-center rounded px-2 py-1.5 text-xs transition-colors hover:bg-muted/70",
                u.value === unit && "bg-accent"
              )}
              onClick={() => handleChange(amount, u.value)}
            >
              {u.label}
              {u.value === unit && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DateFilterValue({ value, onChange }: { value: string; onChange: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const dateVal = value ? (() => { try { return parseISO(value); } catch { return undefined; } })() : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 text-xs shadow-xs hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
        <span className={cn(!value && "text-muted-foreground/50")}>
          {dateVal ? format(dateVal, "MMM d, yyyy") : "Pick date"}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateVal}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : undefined);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function SelectFilterValue({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background px-2 text-xs shadow-xs hover:bg-muted/50 transition-colors cursor-pointer",
          !value && "text-muted-foreground/50"
        )}
      >
        {value ? (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", getOptionBadgeStyle(value))}>
            {value}
          </span>
        ) : (
          "Select..."
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground/60 ml-0.5" />
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1.5" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="h-7 text-xs px-2 mb-1.5 focus-visible:ring-1 focus-visible:ring-ring border-muted/50"
          autoFocus
        />
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {filtered.map((opt) => (
            <button
              key={opt}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors text-left"
              onClick={() => { onChange(opt); setOpen(false); setSearch(""); }}
            >
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", getOptionBadgeStyle(opt))}>
                {opt}
              </span>
              {value === opt && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-2 text-center text-[11px] text-muted-foreground">No options</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TagsFilterValue({ value, onChange, allTags }: { value: string[]; onChange: (v: unknown) => void; allTags: (TagRecord & { id: string })[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = allTags.filter((t) =>
    (t.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (tagId: string) => {
    if (value.includes(tagId)) {
      onChange(value.filter((id) => id !== tagId));
    } else {
      onChange([...value, tagId]);
    }
  };

  const selectedTags = value
    .map((id) => allTags.find((t) => t.id === id))
    .filter(Boolean) as (TagRecord & { id: string })[];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background px-2 text-xs shadow-xs hover:bg-muted/50 transition-colors cursor-pointer max-w-[200px]",
          value.length === 0 && "text-muted-foreground/50"
        )}
      >
        {selectedTags.length > 0 ? (
          <span className="flex items-center gap-1 truncate">
            {selectedTags.map((tag) => (
              <span
                key={tag.id}
                className={cn(
                  "inline-flex h-4 shrink-0 items-center gap-1 rounded-sm px-1.5 py-0 text-[10px] font-medium shadow-none",
                  getTagColorClasses(tag.color || "slate"),
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", getTagDotClass(tag.color || "slate"))} />
                {tag.name}
              </span>
            ))}
          </span>
        ) : (
          "Select tags..."
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground/60 ml-0.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="h-7 text-xs px-2 mb-1.5 focus-visible:ring-1 focus-visible:ring-ring border-muted/50"
          autoFocus
        />
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {filtered.map((tag) => {
            const isSelected = value.includes(tag.id);
            return (
              <button
                key={tag.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors text-left hover:bg-muted/70",
                  isSelected && "bg-accent/50"
                )}
                onClick={() => toggle(tag.id)}
              >
                <div className={cn("flex h-4 w-4 items-center justify-center rounded-sm border border-primary shrink-0", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                  <Check className="h-3 w-3" />
                </div>
                <span className={cn("h-3 w-3 rounded-full shrink-0", getTagDotClass(tag.color || "slate"))} />
                <span className="truncate">{tag.name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-2 text-center text-[11px] text-muted-foreground">No tags found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Filter row (exported) ---
export function FilterRow({
  filter,
  definitions,
  allTags,
  onChange,
  onRemove,
}: {
  filter: QueryFilterCondition;
  definitions: PropertyDefinitionRow[];
  allTags: (TagRecord & { id: string })[];
  onChange: (updated: QueryFilterCondition) => void;
  onRemove: () => void;
}) {
  const propType = getPropertyType(filter.propertyId, definitions);
  const needsValue = !["is_empty", "is_not_empty", "is_checked", "is_unchecked"].includes(filter.operator);

  return (
    <div className="flex items-center gap-1.5">
      <PropertySelector
        propertyId={filter.propertyId}
        definitions={definitions}
        onChange={(newPropId) => {
          const newType = getPropertyType(newPropId, definitions);
          const newOps = OPERATORS_BY_TYPE[newType] ?? OPERATORS_BY_TYPE.text;
          onChange({ propertyId: newPropId, operator: newOps[0].value, value: undefined });
        }}
      />

      <OperatorSelector
        operator={filter.operator}
        propType={propType}
        onChange={(op) => onChange({ ...filter, operator: op })}
      />

      {needsValue && (
        <FilterValueEditor
          filter={filter}
          propType={propType}
          definitions={definitions}
          allTags={allTags}
          onChange={(value) => onChange({ ...filter, value })}
        />
      )}

      <button
        className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
