"use client";

/**
 * The rows of the import dialog's review and mapping steps.
 *
 * Each is a fixed grid rather than a flex row so that columns line up down the
 * whole list — these are scanned, not read, and a ragged right edge makes it hard
 * to compare one file (or key) with the next.
 *
 * The closed selects render their own label: base-ui's `Select.Value` shows the
 * raw value unless it's given children, which would surface encodings like
 * `create:text`.
 */

import { AlertTriangle, Columns3, EyeOff, Link2, Plus, Sparkles, Tag as TagIcon, type LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, type PropertyType } from "@/components/notes/page/types";
import { describeNotes } from "@/lib/notes/import/logseq-normalize";
import type { BuiltinPropertyField } from "@/lib/notes/import/page-properties";
import type { PropertyAction, PropertyCensusEntry } from "@/lib/notes/import/property-mapping";
import type { ScanStatus, ScannedFile } from "@/lib/notes/import/scan-import";
import {
  tagActionKind,
  tagDecisionProblem,
  tagNameWarning,
  type TagActionKind,
  type TagCensusEntry,
  type TagDecision,
} from "@/lib/notes/import/tag-mapping";
import { cn } from "@/lib/shared/utils";

export const STATUS_STYLE: Record<ScanStatus, string> = {
  ready: "text-emerald-600 dark:text-emerald-400",
  journal: "text-muted-foreground",
  already: "text-muted-foreground",
  notMarkdown: "text-muted-foreground/70",
  empty: "text-muted-foreground/70",
  failed: "text-red-600 dark:text-red-400",
};

export const STATUS_LABEL: Record<ScanStatus, string> = {
  ready: "Ready",
  journal: "Skipped",
  already: "Skipped",
  notMarkdown: "Skipped",
  empty: "Skipped",
  failed: "Failed",
};

/** The title a file will actually get, and why it isn't the one it asked for. */
export interface PlannedTitle {
  title: string;
  renamedFrom?: string;
  /** `existing` — a page already has that title. `batch` — two files want it. */
  reason?: "existing" | "batch";
}

// --- Review ------------------------------------------------------------------

export function FileRow({
  file,
  planned,
  checked,
  onToggle,
}: {
  file: ScannedFile;
  planned?: PlannedTitle;
  checked: boolean;
  onToggle: (path: string) => void;
}) {
  // A banner the vault no longer holds comes first: it's the one thing here that
  // will silently not arrive.
  const detail =
    file.banner === "missing"
      ? "banner missing"
      : file.notes.length > 0
        ? describeNotes(file.notes)
        : file.detail;
  const selectable = file.status !== "failed" && file.status !== "notMarkdown";

  return (
    <li>
      {/*
        Two layouts, one set of cells, placed by row and column.
        Narrow: the title leads, with the path and any detail on lines of their
        own — four columns across a phone leaves every one of them truncated.
        Wide: path, title, status in a row, each column sized explicitly. Each row
        is its own grid, so an `auto` column would size to that row's own content
        — one longer status ("Ready · 1 query") then shrinks that row's title
        column and the list stops lining up.

        A label, so the whole row is a tap target and the checkbox toggles once.
      */}
      <label
        className={cn(
          "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3",
          "sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:items-center sm:gap-y-0 sm:py-1.5",
          selectable && "cursor-pointer",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={!selectable}
          onChange={() => onToggle(file.path)}
          aria-label={`Import ${file.path}`}
          className="col-start-1 row-start-1 mt-0.5 h-4 w-4 accent-violet-500 disabled:opacity-40 sm:mt-0"
        />
        <span className="col-start-2 row-start-1 min-w-0 sm:col-start-3">
          <span className="block truncate text-sm text-foreground" title={planned?.title || file.title}>
            {planned?.title || file.title || "—"}
          </span>
          {planned?.renamedFrom ? (
            <span className="block truncate text-[11px] leading-4 text-amber-600 dark:text-amber-400">
              renamed &mdash; &ldquo;{planned.renamedFrom}&rdquo;{" "}
              {planned.reason === "existing" ? "already exists" : "is used twice here"}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "col-start-3 row-start-1 justify-self-end text-xs whitespace-nowrap",
            STATUS_STYLE[file.status],
            "sm:col-start-4",
          )}
        >
          {STATUS_LABEL[file.status]}
        </span>
        <span
          className="col-start-2 col-end-4 row-start-2 min-w-0 truncate text-[11px] leading-4 text-muted-foreground sm:col-start-2 sm:col-end-3 sm:row-start-1 sm:text-xs"
          title={file.path}
        >
          {file.path}
        </span>
        {detail ? (
          <span
            className="col-start-2 col-end-4 row-start-3 min-w-0 truncate text-[11px] leading-4 text-muted-foreground sm:col-start-4 sm:col-end-5 sm:row-start-2 sm:text-right"
            title={detail}
          >
            {detail}
          </span>
        ) : null}
      </label>
    </li>
  );
}

// --- Properties --------------------------------------------------------------

/** Encodes an action into a single select value, and back. */
export function propertyValue(action: PropertyAction): string {
  if (action.kind === "builtin") return `builtin:${action.field}`;
  if (action.kind === "existing") return `existing:${action.definitionId}`;
  if (action.kind === "create") return `create:${action.type}`;
  return "ignore";
}

const BUILTIN_LABEL: Record<BuiltinPropertyField, string> = {
  title: "the page title",
  tags: "tags",
  emoji: "the page emoji",
  favorite: "favourite",
  created: "the created date",
  updated: "the updated date",
  banner: "the page banner",
  bannerAlign: "the banner position",
};

function PropertyActionLabel({
  action,
  definitions,
}: {
  action: PropertyAction;
  definitions: ReadonlyArray<{ id: string; name: string }>;
}) {
  if (action.kind === "builtin") {
    return (
      <>
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate">Into {BUILTIN_LABEL[action.field]}</span>
      </>
    );
  }
  if (action.kind === "existing") {
    const name = definitions.find((definition) => definition.id === action.definitionId)?.name ?? "a property";
    return (
      <>
        <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate">{name}</span>
      </>
    );
  }
  if (action.kind === "create") {
    return (
      <>
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate">New {PROPERTY_TYPE_LABELS[action.type].toLowerCase()} property</span>
      </>
    );
  }
  return (
    <>
      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="truncate">Keep hidden</span>
    </>
  );
}

export function PropertyRow({
  entry,
  action,
  definitions,
  onChange,
}: {
  entry: PropertyCensusEntry;
  action: PropertyAction;
  definitions: ReadonlyArray<{ id: string; name: string; type: PropertyType }>;
  onChange: (action: PropertyAction) => void;
}) {
  const builtin = entry.suggested.kind === "builtin" ? entry.suggested.field : null;

  return (
    // Narrow: the key and its count, then a sample, then a full-width action —
    // a select squeezed into a phone-width column can't show what it says.
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[minmax(5rem,8rem)_2.25rem_minmax(0,1fr)_13rem] sm:gap-y-0 sm:py-2">
      <span
        className="col-start-1 row-start-1 truncate text-sm font-medium text-foreground"
        title={entry.variants.join(" / ")}
      >
        {entry.label}
      </span>
      <span className="col-start-2 row-start-1 text-xs tabular-nums text-muted-foreground sm:justify-self-start">
        {entry.files}&times;
      </span>
      <span
        className="col-start-1 col-end-3 row-start-2 min-w-0 truncate text-xs text-muted-foreground sm:col-start-3 sm:col-end-4 sm:row-start-1"
        title={entry.values.join(", ")}
      >
        {entry.values[0] ?? ""}
      </span>
      <Select
        value={propertyValue(action)}
        onValueChange={(next) => {
          if (!next || next === "ignore") return onChange({ kind: "ignore" });
          const [kind, rest] = next.split(":");
          if (kind === "builtin" && builtin) return onChange({ kind: "builtin", field: builtin });
          if (kind === "existing") return onChange({ kind: "existing", definitionId: rest });
          return onChange({
            kind: "create",
            name: entry.label,
            type: rest as PropertyType,
            options: rest === "select" ? entry.values : [],
          });
        }}
      >
        <SelectTrigger
          size="sm"
          className="col-start-1 col-end-3 row-start-3 w-auto max-w-full justify-self-start sm:col-start-4 sm:col-end-5 sm:row-start-1 sm:w-full"
        >
          <SelectValue>
            <PropertyActionLabel action={action} definitions={definitions} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {builtin ? (
            <SelectGroup>
              <SelectLabel>Built in</SelectLabel>
              <SelectItem value={`builtin:${builtin}`}>
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                Into {BUILTIN_LABEL[builtin]}
              </SelectItem>
            </SelectGroup>
          ) : null}
          {definitions.length > 0 ? (
            <SelectGroup>
              <SelectLabel>Existing property</SelectLabel>
              {definitions.map((definition) => (
                <SelectItem key={definition.id} value={`existing:${definition.id}`}>
                  <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
                  {definition.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          <SelectGroup>
            <SelectLabel>Create a property</SelectLabel>
            {PROPERTY_TYPES.map((type) => (
              <SelectItem key={type} value={`create:${type}`}>
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                New {PROPERTY_TYPE_LABELS[type].toLowerCase()} property
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Or not at all</SelectLabel>
            <SelectItem value="ignore">
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              Keep hidden
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </li>
  );
}

// --- Tags --------------------------------------------------------------------

const TAG_ACTION_LABEL: Record<TagActionKind, string> = {
  existing: "Use existing tag",
  create: "Create tag",
  link: "Link only",
  both: "Tag and link",
  ignore: "Ignore",
};

const TAG_ACTION_ICON: Record<TagActionKind, LucideIcon> = {
  existing: TagIcon,
  create: Plus,
  link: Link2,
  both: Link2,
  ignore: EyeOff,
};

export function TagRow({
  entry,
  decision,
  tags,
  onChange,
}: {
  entry: TagCensusEntry;
  decision: TagDecision;
  tags: ReadonlyArray<{ id: string; name: string }>;
  onChange: (decision: TagDecision) => void;
}) {
  const kind = tagActionKind(decision);
  const Icon = TAG_ACTION_ICON[kind];
  const naming = kind === "create" || kind === "both";
  const name = decision.tag && "createName" in decision.tag ? decision.tag.createName : entry.label;
  const existing = tags.find((tag) => tag.name.trim().toLowerCase() === entry.valueId);
  // Read off the name as it stands, so the row and the footer's block always
  // agree — including for spaces typed into a name that arrived without any.
  const problem = tagDecisionProblem(decision);
  const warning = problem === "spaces" ? tagNameWarning(name) : null;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[minmax(5rem,9rem)_2.25rem_minmax(0,1fr)_11rem] sm:gap-y-0 sm:py-2">
      <span
        className="col-start-1 row-start-1 truncate text-sm text-foreground sm:pt-1.5"
        title={entry.variants.join(" / ")}
      >
        {entry.source === "hashtag" ? `#${entry.label}` : entry.label}
      </span>
      <span className="col-start-2 row-start-1 text-xs tabular-nums text-muted-foreground sm:pt-2">
        {entry.files}&times;
      </span>

      <div className="col-start-1 col-end-3 row-start-2 min-w-0 sm:col-start-3 sm:col-end-4 sm:row-start-1">
        {naming ? (
          <Input
            value={name}
            onChange={(event) => onChange({ ...decision, tag: { createName: event.target.value } })}
            aria-label={`Tag name for ${entry.label}`}
            aria-invalid={problem !== null}
            // Marks the row the footer is refusing to import on.
            className={cn("h-8 text-sm", problem && "border-amber-500/70")}
          />
        ) : (
          // Never an empty box: say what will happen instead.
          <p className="pt-1.5 text-xs text-muted-foreground">
            {kind === "existing"
              ? `Tagged “${existing?.name ?? entry.label}”`
              : kind === "link"
                ? `Linked as [[${entry.label}]]`
                : "Left out"}
          </p>
        )}
        {warning ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span>
              Spaces don&rsquo;t work with the <code className="font-mono">tag:</code> search prefix.{" "}
              <button
                type="button"
                className="font-medium whitespace-nowrap underline underline-offset-2 hover:text-foreground"
                onClick={() => onChange({ ...decision, tag: { createName: warning.suggestion } })}
              >
                Use {warning.suggestion}
              </button>
            </span>
          </p>
        ) : null}
      </div>

      <Select
        value={kind}
        onValueChange={(next) => {
          if (next === "existing" && existing) return onChange({ tag: { existingId: existing.id }, link: false });
          if (next === "create") return onChange({ tag: { createName: entry.label }, link: false });
          if (next === "link") return onChange({ tag: null, link: true });
          if (next === "both") return onChange({ tag: { createName: entry.label }, link: true });
          return onChange({ tag: null, link: false });
        }}
      >
        <SelectTrigger
          size="sm"
          className="col-start-1 col-end-3 row-start-3 w-auto max-w-full justify-self-start sm:col-start-4 sm:col-end-5 sm:row-start-1 sm:w-full"
        >
          <SelectValue>
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{TAG_ACTION_LABEL[kind]}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {existing ? (
            <SelectItem value="existing">
              <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Use existing tag
            </SelectItem>
          ) : null}
          <SelectItem value="create">
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            Create tag
          </SelectItem>
          {entry.isPageTitle ? (
            <SelectItem value="link">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              Link only
            </SelectItem>
          ) : null}
          {entry.isPageTitle ? (
            <SelectItem value="both">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              Tag and link
            </SelectItem>
          ) : null}
          <SelectItem value="ignore">
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            Ignore
          </SelectItem>
        </SelectContent>
      </Select>
    </li>
  );
}
