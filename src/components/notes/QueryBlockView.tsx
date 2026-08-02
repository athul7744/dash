"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Columns3,
  Database,
  Filter,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { usePropertyDefinitions } from "@/hooks/use-property-definitions";
import { useEntityTags } from "@/hooks/use-entity-tags";
import type { Tag as TagRecord } from "@/lib/powersync/AppSchema";
import type { QueryBlockConfig, QueryFilterCondition, QuerySortConfig } from "@/lib/notes/query-block";
import { BUILT_IN_PROPERTIES, OPERATORS_BY_TYPE } from "@/lib/notes/query-block";
import { encodeQueryConfig } from "@/lib/notes/query-block-content";
import type { PropertyType } from "@/components/notes/page/types";
import { parseCustomPropertyValues } from "@/lib/notes/properties";
import { normalizePageEmoji, parseProperties } from "@/components/notes/page/utils";

import { type QueryResultRow, parseConfig, buildQuerySQL, getPropertyName } from "./query-block-sql";
import { PROPERTY_TYPE_ICONS, getPropertyIcon, getPropertyCustomIcon } from "./query-block-helpers";
import { FilterRow } from "./QueryBlockFilters";
import { InlineCellValue } from "./QueryBlockCells";

// Result-table column widths (px). The title column flexes from this minimum;
// data columns are fixed. Kept as constants so the inner wrapper's computed
// min-width stays in sync with the actual column sizing.
const TITLE_COL_MIN_PX = 160;
const DATA_COL_PX = 120;

// --- Column chooser popover ---
function ColumnChooser({
  columns,
  definitions,
  onChange,
}: {
  columns: string[];
  definitions: import("@/hooks/use-property-definitions").PropertyDefinitionRow[];
  onChange: (columns: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allProperties = [
    ...BUILT_IN_PROPERTIES.filter((p) => p.id !== "__title__"),
    ...definitions.map((d) => ({ id: d.id, name: d.name, type: d.type })),
  ];

  const toggle = (propId: string) => {
    if (columns.includes(propId)) {
      onChange(columns.filter((c) => c !== propId));
    } else {
      onChange([...columns, propId]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Columns3 className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end">
        <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">Show columns</p>
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {allProperties.map((prop) => {
            const propCustomIcon = getPropertyCustomIcon(prop.id, definitions);
            const PropIcon = PROPERTY_TYPE_ICONS[(prop.type as PropertyType | "title" | "date_meta")] ?? PROPERTY_TYPE_ICONS.text;
            const isSelected = columns.includes(prop.id);
            return (
              <button
                key={prop.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors text-left hover:bg-muted/70",
                  isSelected && "bg-accent/50"
                )}
                onClick={() => toggle(prop.id)}
              >
                {propCustomIcon ? (
                  <SpriteIcon name={propCustomIcon} size={14} className="shrink-0" />
                ) : (
                  <PropIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">{prop.name}</span>
                {isSelected && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Sortable column header ---
function SortableHeader({
  label,
  propertyId,
  sort,
  onSort,
}: {
  label: string;
  propertyId: string;
  sort?: QuerySortConfig;
  onSort: (sort: QuerySortConfig | undefined) => void;
}) {
  const isActive = sort?.propertyId === propertyId;
  const direction = isActive ? sort.direction : null;

  const handleClick = () => {
    if (!isActive) {
      onSort({ propertyId, direction: "asc" });
    } else if (direction === "asc") {
      onSort({ propertyId, direction: "desc" });
    } else {
      onSort(undefined);
    }
  };

  return (
    <button
      className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      onClick={handleClick}
    >
      <span className="truncate">{label}</span>
      {isActive && direction === "asc" && <ArrowUp className="h-3 w-3 text-foreground/70" />}
      {isActive && direction === "desc" && <ArrowDown className="h-3 w-3 text-foreground/70" />}
    </button>
  );
}

// --- Main component ---
export function QueryBlockView({
  content,
  onUpdateContent,
  onOpenPageReference,
}: {
  content: string | null | undefined;
  onUpdateContent: (content: unknown) => void;
  onOpenPageReference?: (title: string) => void;
}) {
  const config = useMemo(() => parseConfig(content), [content]);
  const { definitions } = usePropertyDefinitions();
  const [isEditing, setIsEditing] = useState(config.filters.length === 0);
  const { data: allTags = [] } = useQuery<TagRecord & { id: string }>("SELECT id, name, color FROM tags ORDER BY name ASC");

  const { sql, params } = useMemo(() => buildQuerySQL(config, definitions), [config, definitions]);
  const { data: results = [] } = useQuery<QueryResultRow>(sql, params);
  // Tags for the result pages, batched from entity_tags for the tags column.
  const rowTags = useEntityTags(useMemo(() => results.map((r) => r.id), [results]));

  const columns = config.columns ?? [];

  const updateConfig = useCallback(
    (next: QueryBlockConfig) => {
      onUpdateContent(encodeQueryConfig(next));
    },
    [onUpdateContent]
  );

  const addFilter = () => {
    const firstProp = BUILT_IN_PROPERTIES[0];
    const ops = OPERATORS_BY_TYPE[firstProp.type];
    const newFilter: QueryFilterCondition = {
      propertyId: firstProp.id,
      operator: ops[0].value,
    };
    updateConfig({ ...config, filters: [...config.filters, newFilter] });
  };

  const updateFilter = (index: number, updated: QueryFilterCondition) => {
    const next = [...config.filters];
    next[index] = updated;
    updateConfig({ ...config, filters: next });
  };

  const removeFilter = (index: number) => {
    updateConfig({ ...config, filters: config.filters.filter((_, i) => i !== index) });
  };

  const getPageProperties = (row: QueryResultRow): Record<string, unknown> => parseProperties(row.properties);
  const getPageEmoji = (row: QueryResultRow): string | null => normalizePageEmoji(getPageProperties(row).emoji);

  const getCellValue = (row: QueryResultRow, propertyId: string): unknown => {
    if (propertyId === "__created_at__") return row.created_at;
    if (propertyId === "__updated_at__") return row.updated_at;
    const props = getPageProperties(row);
    const custom = parseCustomPropertyValues(props);
    return custom[propertyId] ?? null;
  };

  return (
    <div className="my-1 rounded-md border border-border/60 bg-muted/30">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5">
        <Database className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Query</span>
        <div className="ml-auto flex items-center gap-2">
          <ColumnChooser
            columns={columns}
            definitions={definitions}
            onChange={(next) => updateConfig({ ...config, columns: next })}
          />
          <button
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Filter className="h-3 w-3" />
            <ChevronDown className={`h-3 w-3 transition-transform ${isEditing ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter editor */}
      {isEditing && (
        <div className="space-y-1.5 border-b border-border/40 px-3 py-2">
          {config.filters.map((filter, index) => (
            <FilterRow
              key={index}
              filter={filter}
              definitions={definitions}
              allTags={allTags}
              onChange={(updated) => updateFilter(index, updated)}
              onRemove={() => removeFilter(index)}
            />
          ))}
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={addFilter}>
            <Plus className="h-3 w-3" />
            Add filter
          </Button>
        </div>
      )}

      {/* Results */}
      <div className="py-0.5">
        {results.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No matching pages</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: `max(100%, ${TITLE_COL_MIN_PX + columns.length * DATA_COL_PX}px)` }}>
              {/* Column headers */}
              <div className="flex items-stretch border-b border-border/50">
                <div className="flex-1 flex items-center px-3 py-2" style={{ minWidth: TITLE_COL_MIN_PX }}>
                  <SortableHeader
                    label="Title"
                    propertyId="__title__"
                    sort={config.sort}
                    onSort={(sort) => updateConfig({ ...config, sort })}
                  />
                </div>
                {columns.map((colId) => {
                  const customIcon = getPropertyCustomIcon(colId, definitions);
                  const ColIcon = getPropertyIcon(colId, definitions);
                  return (
                    <div key={colId} className="shrink-0 flex items-center gap-1 border-l border-border/30 px-3 py-2" style={{ width: DATA_COL_PX }}>
                      {customIcon ? (
                        <SpriteIcon name={customIcon} size={12} className="shrink-0" />
                      ) : (
                        <ColIcon className="h-3 w-3 shrink-0 opacity-60" />
                      )}
                      <SortableHeader
                        label={getPropertyName(colId, definitions)}
                        propertyId={colId}
                        sort={config.sort}
                        onSort={(sort) => updateConfig({ ...config, sort })}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              {results.map((row) => {
                const emoji = getPageEmoji(row);
                const props = getPageProperties(row);
                return (
                  <div
                    key={row.id}
                    className="flex items-stretch border-b border-border/20 last:border-b-0 hover:bg-accent/30 transition-colors group"
                  >
                    <div className="flex-1 flex items-center gap-1.5 px-3 py-2" style={{ minWidth: TITLE_COL_MIN_PX }}>
                      {emoji && <SpriteIcon name={emoji} size={16} className="shrink-0" />}
                      <button
                        className="text-sm text-left truncate hover:underline"
                        onClick={() => onOpenPageReference?.(row.title)}
                      >
                        {row.title}
                      </button>
                    </div>
                    {columns.map((colId) => (
                      <div key={colId} className="shrink-0 flex items-center border-l border-border/20 px-3 py-2 text-xs" style={{ width: DATA_COL_PX }}>
                        <InlineCellValue
                          pageId={row.id}
                          propertyId={colId}
                          value={getCellValue(row, colId)}
                          properties={props}
                          definitions={definitions}
                          allTags={allTags}
                          tagIds={rowTags.get(row.id) ?? []}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {results.length >= (config.limit ?? 20) && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Showing {config.limit ?? 20} results
          </p>
        )}
      </div>
    </div>
  );
}
