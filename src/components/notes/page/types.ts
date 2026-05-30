import type { NoteBlockRow, NotePageRow } from "@/hooks/use-notes";

export type NoteTag = {
  id: string;
  key: string;
  name: string;
  color: string;
};

export type NormalizedNotePage = NotePageRow & {
  summary: string | null;
  tags: NoteTag[];
  emoji: string | null;
};

export const PROPERTY_TYPES = ["text", "number", "date", "select", "checkbox", "url"] as const;
export type PropertyType = typeof PROPERTY_TYPES[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  checkbox: "Checkbox",
  url: "URL",
};

export type PropertyDefinitionConfig = {
  options?: string[];
  icon?: string;
};

export type ResolvedPageProperty = {
  definitionId: string;
  name: string;
  type: PropertyType;
  config: PropertyDefinitionConfig;
  value: unknown;
};

export type TagDirectoryEntry = {
  key: string;
  label: string;
  color: string;
  count: number;
  pages: NormalizedNotePage[];
};

export type OptimisticBlockStructure = Pick<NoteBlockRow, "parent_block_id" | "sort_rank">;

export type OutlineEntry = {
  blockId: string;
  indentLevel: number;
  level: number;
  text: string;
};

export type NotesEditorRenderableContent = {
  pageId: string;
  title: string;
  emoji: string | null;
  favorite: boolean;
  tags: NoteTag[];
  blockCount: number;
  backlinkCount: number;
  blocks: NoteBlockRow[];
} | null;

export const NOTE_OVERVIEW_ACCENT_CLASSES: Record<string, { icon: string; border: string; glow: string }> = {
  amber: { icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300", border: "border-amber-200/80 dark:border-amber-800/70", glow: "from-amber-500/14 via-amber-500/5 to-transparent" },
  emerald: { icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300", border: "border-emerald-200/80 dark:border-emerald-800/70", glow: "from-emerald-500/14 via-emerald-500/5 to-transparent" },
  teal: { icon: "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300", border: "border-teal-200/80 dark:border-teal-800/70", glow: "from-teal-500/14 via-teal-500/5 to-transparent" },
  cyan: { icon: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300", border: "border-cyan-200/80 dark:border-cyan-800/70", glow: "from-cyan-500/14 via-cyan-500/5 to-transparent" },
  sky: { icon: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300", border: "border-sky-200/80 dark:border-sky-800/70", glow: "from-sky-500/14 via-sky-500/5 to-transparent" },
  violet: { icon: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300", border: "border-violet-200/80 dark:border-violet-800/70", glow: "from-violet-500/14 via-violet-500/5 to-transparent" },
  purple: { icon: "bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300", border: "border-purple-200/80 dark:border-purple-800/70", glow: "from-purple-500/14 via-purple-500/5 to-transparent" },
  fuchsia: { icon: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/60 dark:text-fuchsia-300", border: "border-fuchsia-200/80 dark:border-fuchsia-800/70", glow: "from-fuchsia-500/14 via-fuchsia-500/5 to-transparent" },
  pink: { icon: "bg-pink-100 text-pink-700 dark:bg-pink-900/60 dark:text-pink-300", border: "border-pink-200/80 dark:border-pink-800/70", glow: "from-pink-500/14 via-pink-500/5 to-transparent" },
  rose: { icon: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300", border: "border-rose-200/80 dark:border-rose-800/70", glow: "from-rose-500/14 via-rose-500/5 to-transparent" },
  slate: { icon: "bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300", border: "border-slate-200/80 dark:border-slate-700/70", glow: "from-slate-500/14 via-slate-500/5 to-transparent" },
  lime: { icon: "bg-lime-100 text-lime-700 dark:bg-lime-900/60 dark:text-lime-300", border: "border-lime-200/80 dark:border-lime-800/70", glow: "from-lime-500/14 via-lime-500/5 to-transparent" },
  zinc: { icon: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300", border: "border-zinc-200/80 dark:border-zinc-700/70", glow: "from-zinc-500/14 via-zinc-500/5 to-transparent" },
  stone: { icon: "bg-stone-100 text-stone-700 dark:bg-stone-900/60 dark:text-stone-300", border: "border-stone-200/80 dark:border-stone-700/70", glow: "from-stone-500/14 via-stone-500/5 to-transparent" },
};