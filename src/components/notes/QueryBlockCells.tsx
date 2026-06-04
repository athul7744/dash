"use client";

import { useState } from "react";
import { Check } from "lucide-react";
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
import { TagSelector } from "@/components/tags/TagSelector";
import type { PropertyDefinitionRow } from "@/hooks/use-property-definitions";
import type { Tag as TagRecord } from "@/lib/powersync/AppSchema";
import { updateNotePageProperties } from "@/lib/notes/notes";
import type { JsonValue } from "@/lib/notes/notes";
import { parseCustomPropertyValues, updatePropertyDefinitionConfig } from "@/lib/notes/properties";
import { useOptimisticValue } from "@/hooks/use-optimistic-value";
import { getPropertyType } from "./query-block-sql";
import { getOptionBadgeStyle } from "./query-block-helpers";

function InlineTagsCell({
  pageId,
  pageProperties,
  allTags,
}: {
  pageId: string;
  pageProperties: Record<string, unknown>;
  allTags: (TagRecord & { id: string })[];
}) {
  const upstreamTagIds: string[] = Array.isArray(pageProperties.tags) ? (pageProperties.tags as string[]) : [];

  const [tagIds, setOptimisticTagIds] = useOptimisticValue<string[]>(upstreamTagIds);

  const handleChange = (nextTagIds: string[]) => {
    setOptimisticTagIds(nextTagIds);
    updateNotePageProperties(pageId, { ...pageProperties, tags: nextTagIds } as Record<string, JsonValue>);
  };

  const resolvedTags = tagIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter(Boolean) as (TagRecord & { id: string })[];

  return (
    <TagSelector
      selectedTagIds={tagIds}
      onSelectedTagIdsChange={handleChange}
      density="compact"
      triggerLabel="—"
      triggerClassName="h-auto w-full justify-start border-none bg-transparent px-0 py-0 text-muted-foreground/40 hover:bg-transparent"
      popoverWidthClassName="w-[220px]"
      showSelectedTags={false}
      maxSelected={5}
      triggerContent={
        resolvedTags.length > 0 ? (
          <div className="flex items-center gap-1 flex-wrap">
            {resolvedTags.map((tag) => (
              <span
                key={tag.id}
                className={cn(
                  "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 py-0 text-[10px] font-medium shadow-none",
                  getTagColorClasses(tag.color || "slate"),
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", getTagDotClass(tag.color || "slate"))} />
                {tag.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )
      }
    />
  );
}

function InlineCheckbox({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const checked = value === true || value === "true";
  return (
    <button
      className={cn(
        "h-4 w-4 rounded border transition-colors",
        checked ? "bg-violet-500 border-violet-500 text-white" : "border-border hover:border-foreground/40"
      )}
      onClick={() => onChange(!checked)}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  );
}

function InlineSelect({
  value,
  options,
  onChange,
  definitionId,
  definitions,
}: {
  value: string;
  options: string[];
  onChange: (v: unknown) => void;
  definitionId: string;
  definitions: PropertyDefinitionRow[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase()));
  const showCreate = search.trim() !== "" && !options.some((o) => o.toLowerCase() === search.trim().toLowerCase());

  const handleCreateOption = async () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    const def = definitions.find((d) => d.id === definitionId);
    const config = def?.config ? JSON.parse(def.config) : {};
    const nextOptions = [...(config.options ?? []), trimmed];
    await updatePropertyDefinitionConfig(definitionId, { ...config, options: nextOptions });
    onChange(trimmed);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="cursor-pointer text-left">
        {value ? (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", getOptionBadgeStyle(value))}>{value}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1.5" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="h-7 text-xs px-2 mb-1.5 focus-visible:ring-1 focus-visible:ring-ring border-muted/50"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (showCreate) handleCreateOption();
              else if (filtered.length > 0) { onChange(filtered[0]); setOpen(false); setSearch(""); }
            }
          }}
        />
        <div className="max-h-36 overflow-y-auto space-y-0.5">
          {filtered.map((opt) => (
            <button
              key={opt}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/70 transition-colors text-left"
              onClick={() => { onChange(opt); setOpen(false); setSearch(""); }}
            >
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", getOptionBadgeStyle(opt))}>{opt}</span>
              {value === opt && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
            </button>
          ))}
          {showCreate && (
            <button
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/70 transition-colors"
              onClick={handleCreateOption}
            >
              <span className="text-muted-foreground/50">Create</span>
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", getOptionBadgeStyle(search.trim()))}>{search.trim()}</span>
            </button>
          )}
          {value && (
            <button
              className="flex w-full items-center rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/70 transition-colors"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InlineDate({ value, onChange }: { value: string; onChange: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const dateVal = value ? (() => { try { return parseISO(value); } catch { return undefined; } })() : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="cursor-pointer text-left">
        {dateVal ? (
          <span>{format(dateVal, "MMM d, yyyy")}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateVal}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function InlineNumber({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [editing, setEditing] = useState(false);
  const display = value != null && value !== "" ? String(value) : null;

  if (editing) {
    return (
      <Input
        type="number"
        className="h-6 w-16 px-1.5 text-xs"
        defaultValue={display ?? ""}
        autoFocus
        onBlur={(e) => { onChange(e.target.value || null); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") { onChange((e.target as HTMLInputElement).value || null); setEditing(false); } }}
      />
    );
  }
  return (
    <button className="cursor-pointer text-left" onClick={() => setEditing(true)}>
      {display ?? <span className="text-muted-foreground/40">—</span>}
    </button>
  );
}

function InlineText({ value, onChange }: { value: string; onChange: (v: unknown) => void }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Input
        type="text"
        className="h-6 w-24 px-1.5 text-xs"
        defaultValue={value ?? ""}
        autoFocus
        onBlur={(e) => { onChange(e.target.value || null); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") { onChange((e.target as HTMLInputElement).value || null); setEditing(false); } }}
      />
    );
  }
  return (
    <button className="cursor-pointer text-left truncate max-w-[100px]" onClick={() => setEditing(true)}>
      {value || <span className="text-muted-foreground/40">—</span>}
    </button>
  );
}

// --- Exported main cell router ---
export function InlineCellValue({
  pageId,
  propertyId,
  value,
  properties,
  definitions,
  allTags,
}: {
  pageId: string;
  propertyId: string;
  value: unknown;
  properties: Record<string, unknown>;
  definitions: PropertyDefinitionRow[];
  allTags: (TagRecord & { id: string })[];
}) {
  const propType = getPropertyType(propertyId, definitions);

  const [effectiveValue, setOptimisticValue] = useOptimisticValue<unknown>(value);

  // Built-in read-only columns
  if (propertyId === "__created_at__" || propertyId === "__updated_at__") {
    const dateStr = value as string | null;
    if (!dateStr) return <span className="text-muted-foreground/40">—</span>;
    try {
      return <span>{format(parseISO(dateStr), "MMM d, yyyy")}</span>;
    } catch {
      return <span className="text-muted-foreground/40">—</span>;
    }
  }

  if (propertyId === "__tags__") {
    return <InlineTagsCell pageId={pageId} pageProperties={properties} allTags={allTags} />;
  }

  const updateValue = (nextValue: unknown) => {
    setOptimisticValue(nextValue);
    const customValues = parseCustomPropertyValues(properties);
    const nextCustom = { ...customValues, [propertyId]: nextValue };
    const nextProperties = { ...properties, custom: nextCustom };
    updateNotePageProperties(pageId, nextProperties as Record<string, JsonValue>);
  };

  if (propType === "checkbox") {
    return <InlineCheckbox value={effectiveValue} onChange={updateValue} />;
  }
  if (propType === "select") {
    const def = definitions.find((d) => d.id === propertyId);
    const options: string[] = def ? (JSON.parse(def.config || "{}").options ?? []) : [];
    return <InlineSelect value={effectiveValue as string} options={options} onChange={updateValue} definitionId={propertyId} definitions={definitions} />;
  }
  if (propType === "date") {
    return <InlineDate value={effectiveValue as string} onChange={updateValue} />;
  }
  if (propType === "number") {
    return <InlineNumber value={effectiveValue} onChange={updateValue} />;
  }
  // text, url, title
  return <InlineText value={effectiveValue as string} onChange={updateValue} />;
}
