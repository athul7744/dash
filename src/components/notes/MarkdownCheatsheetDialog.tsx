"use client";

/**
 * Reference popup listing every markdown / keyboard shortcut the notes editor
 * recognizes while typing. Opened from the editor's three-dot menu. Each group
 * gets a soft accent so the sheet is easy to scan.
 */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Shortcut = { keys: string; label: string };
type Accent = { header: string; chip: string; rail: string };
type Group = { title: string; accent: Accent; items: Shortcut[] };

const ACCENTS: Record<string, Accent> = {
  sky: { header: "text-sky-600 dark:text-sky-400", chip: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300", rail: "bg-sky-500/60" },
  violet: { header: "text-violet-600 dark:text-violet-400", chip: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300", rail: "bg-violet-500/60" },
  indigo: { header: "text-indigo-600 dark:text-indigo-400", chip: "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", rail: "bg-indigo-500/60" },
  amber: { header: "text-amber-600 dark:text-amber-400", chip: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300", rail: "bg-amber-500/60" },
  teal: { header: "text-teal-600 dark:text-teal-400", chip: "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300", rail: "bg-teal-500/60" },
};

const GROUPS: Group[] = [
  {
    title: "Blocks",
    accent: ACCENTS.sky,
    items: [
      { keys: "#  …  #####", label: "Heading 1 – 5" },
      { keys: ">", label: "Quote" },
      { keys: "[]   ·   [x]", label: "To-do (empty · done)" },
      { keys: "```", label: "Code block" },
      { keys: "---", label: "Divider" },
      { keys: "$$ E=mc^2 $$", label: "Equation block" },
      { keys: "![alt](url)", label: "Image" },
    ],
  },
  {
    title: "Text",
    accent: ACCENTS.violet,
    items: [
      { keys: "**bold**", label: "Bold" },
      { keys: "*italic*", label: "Italic" },
      { keys: "~~strike~~", label: "Strikethrough" },
      { keys: "`code`", label: "Inline code" },
      { keys: "$a^2$", label: "Inline equation" },
      { keys: "[label](url)", label: "Link" },
      { keys: "-->   <--", label: "Arrows  → ←" },
    ],
  },
  {
    title: "References & tokens",
    accent: ACCENTS.indigo,
    items: [
      { keys: "[[", label: "Link to a page (opens picker)" },
      { keys: "{May 2, 2025}", label: "Date" },
    ],
  },
  {
    title: "Block color",
    accent: ACCENTS.amber,
    items: [
      { keys: "!blue", label: "Tint the block (gray, blue, green, …)" },
      { keys: "!none", label: "Clear the block color" },
    ],
  },
  {
    title: "Menu",
    accent: ACCENTS.teal,
    items: [{ keys: "/", label: "Command menu — tables, queries, colors, dates" }],
  },
];

export function MarkdownCheatsheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Markdown shortcuts</DialogTitle>
          <DialogDescription>Type these as you write — no need to reach for the mouse.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section
              key={group.title}
              className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/25 py-2.5 pl-4 pr-3"
            >
              <span className={`absolute inset-y-2 left-0 w-1 rounded-full ${group.accent.rail}`} aria-hidden />
              <h3 className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${group.accent.header}`}>
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5">
                    <kbd
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] leading-4 ${group.accent.chip}`}
                    >
                      {item.keys}
                    </kbd>
                    <span className="min-w-0 flex-1 text-[13px] leading-5 text-foreground/85">{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
