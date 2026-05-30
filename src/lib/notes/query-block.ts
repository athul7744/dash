"use client";

import type { PropertyType } from "@/components/notes/page/types";

// --- Query block content schema ---

export type QueryFilterOperator =
  // text / url
  | "equals" | "not_equals" | "contains" | "not_contains" | "is_empty" | "is_not_empty"
  // number
  | "eq" | "neq" | "gt" | "lt" | "gte" | "lte"
  // date
  | "is" | "is_before" | "is_after" | "is_within"
  // select
  | "is_any" | "is_none"
  // checkbox
  | "is_checked" | "is_unchecked";

export type QueryFilterCondition = {
  propertyId: string; // property_definitions.id or "__title__" / "__created_at__" / "__updated_at__"
  operator: QueryFilterOperator;
  value?: unknown; // string, number, date string, string[] etc.
};

export type QuerySortDirection = "asc" | "desc";

export type QuerySortConfig = {
  propertyId: string;
  direction: QuerySortDirection;
};

export type QueryBlockConfig = {
  filters: QueryFilterCondition[];
  columns?: string[]; // property IDs to display as columns
  sort?: QuerySortConfig;
  limit?: number; // default 20
};

// Operators by property type
export const OPERATORS_BY_TYPE: Record<PropertyType | "title" | "date_meta" | "tags", { value: QueryFilterOperator; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "equals", label: "is" },
    { value: "not_equals", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  url: [
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
  ],
  date: [
    { value: "is", label: "is" },
    { value: "is_before", label: "is before" },
    { value: "is_after", label: "is after" },
    { value: "is_within", label: "is within last" },
  ],
  date_meta: [
    { value: "is_before", label: "is before" },
    { value: "is_after", label: "is after" },
    { value: "is_within", label: "is within last" },
  ],
  select: [
    { value: "equals", label: "is" },
    { value: "not_equals", label: "is not" },
    { value: "is_any", label: "is any of" },
    { value: "is_none", label: "is none of" },
  ],
  checkbox: [
    { value: "is_checked", label: "is checked" },
    { value: "is_unchecked", label: "is unchecked" },
  ],
  title: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "equals", label: "is" },
    { value: "not_equals", label: "is not" },
  ],
  tags: [
    { value: "is_any", label: "includes" },
    { value: "is_none", label: "excludes" },
    { value: "is_empty", label: "has no tags" },
    { value: "is_not_empty", label: "has tags" },
  ],
};

// Built-in sortable/filterable "properties"
export const BUILT_IN_PROPERTIES = [
  { id: "__title__", name: "Title", type: "title" as const },
  { id: "__tags__", name: "Tags", type: "tags" as const },
  { id: "__created_at__", name: "Created", type: "date_meta" as const },
  { id: "__updated_at__", name: "Updated", type: "date_meta" as const },
];
