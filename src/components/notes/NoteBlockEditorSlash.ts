import type { Editor, JSONContent } from "@tiptap/core";
import { Calendar, CalendarDays, CalendarPlus, Code2, Database, Heading1, Heading2, Heading3, Heading4, Heading5, ImageIcon, Link2, ListTodo, Minus, Paintbrush, Quote, Sigma, Table2, TextCursorInput, Type, type LucideIcon } from "lucide-react";

import { DATE_TOKEN_NODE_TYPE, formatDateLabel, getRelativeDate } from "@/lib/notes/date-tokens";
import { encodeQueryConfig } from "@/lib/notes/query-block-content";
import { filterSlashCommands, groupSlashCommands, type SlashCommandSection } from "@/lib/notes/slash-command-filter";
export type { SlashCommandSection } from "@/lib/notes/slash-command-filter";

export type SlashCommand = {
  id: string;
  section: SlashCommandSection;
  title: string;
  description: string;
  shortcut: string;
  icon: LucideIcon;
  keywords: string[];
  createContent: () => JSONContent;
  execute?: (editor: Editor) => void;
  /** If set, the block should be created with this type instead of "text" */
  blockType?: string;
  /** Marks a command handled specially by the menu UI (e.g. opening a picker)
   *  instead of inserting `createContent` directly. */
  custom?: "date-picker";
};

function createParagraphNode(text: string): JSONContent {
  return {
    type: "paragraph",
    content: text.length > 0 ? [{ type: "text", text }] : [],
  };
}

export function emptyDocument(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

export function emptyTaskListDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function emptyHeadingDocument(level: 1 | 2 | 3 | 4 | 5): JSONContent {
  return {
    type: "doc",
    content: [{ type: "heading", attrs: { level }, content: [] }],
  };
}

function emptyBlockquoteDocument(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "blockquote", content: [{ type: "paragraph" }] }],
  };
}

function emptyCodeBlockDocument(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "codeBlock", attrs: { language: null }, content: [] }],
  };
}

export function emptyHorizontalRuleDocument(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "horizontalRule" }],
  };
}

export function createScaffoldDocument(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: text.length > 0 ? [{ type: "text", text }] : [] }],
  };
}

function emptyTableDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [createParagraphNode("")] },
              { type: "tableHeader", content: [createParagraphNode("")] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [createParagraphNode("")] },
              { type: "tableCell", content: [createParagraphNode("")] },
            ],
          },
        ],
      },
    ],
  };
}

function emptyMathBlockDocument(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "mathBlock", attrs: { latex: "" } }],
  };
}

export const slashCommandSections: Array<{ id: SlashCommandSection; title: string; icon: LucideIcon }> = [
  { id: "basic", title: "Basic", icon: TextCursorInput },
  { id: "structure", title: "Structure", icon: Table2 },
  { id: "media", title: "Media", icon: ImageIcon },
  { id: "dates", title: "Dates", icon: Calendar },
  { id: "advanced", title: "Advanced", icon: Database },
  { id: "color", title: "Color", icon: Paintbrush },
];

export const slashCommands: SlashCommand[] = [
  {
    id: "text",
    section: "basic",
    title: "Text",
    description: "Turn this block into plain text.",
    shortcut: "/text",
    icon: Type,
    keywords: ["paragraph", "text", "normal"],
    createContent: () => emptyDocument(),
  },
  {
    id: "heading-1",
    section: "basic",
    title: "Heading 1",
    description: "Large section heading.",
    shortcut: "/h1",
    icon: Heading1,
    keywords: ["heading", "title", "h1"],
    createContent: () => emptyHeadingDocument(1),
  },
  {
    id: "heading-2",
    section: "basic",
    title: "Heading 2",
    description: "Medium section heading.",
    shortcut: "/h2",
    icon: Heading2,
    keywords: ["heading", "subtitle", "h2"],
    createContent: () => emptyHeadingDocument(2),
  },
  {
    id: "heading-3",
    section: "basic",
    title: "Heading 3",
    description: "Compact section heading.",
    shortcut: "/h3",
    icon: Heading3,
    keywords: ["heading", "subheading", "h3"],
    createContent: () => emptyHeadingDocument(3),
  },
  {
    id: "heading-4",
    section: "basic",
    title: "Heading 4",
    description: "Small section heading.",
    shortcut: "/h4",
    icon: Heading4,
    keywords: ["heading", "minor heading", "h4"],
    createContent: () => emptyHeadingDocument(4),
  },
  {
    id: "heading-5",
    section: "basic",
    title: "Heading 5",
    description: "Subtle section heading.",
    shortcut: "/h5",
    icon: Heading5,
    keywords: ["heading", "small heading", "h5"],
    createContent: () => emptyHeadingDocument(5),
  },
  {
    id: "quote",
    section: "basic",
    title: "Quote",
    description: "Start a block quote.",
    shortcut: "/quote",
    icon: Quote,
    keywords: ["blockquote", "quote", "callout"],
    createContent: () => emptyBlockquoteDocument(),
  },
  {
    id: "task-list",
    section: "structure",
    title: "Task List",
    description: "Checklist block with one item.",
    shortcut: "/todo",
    icon: ListTodo,
    keywords: ["task", "todo", "checklist", "checkbox"],
    createContent: () => emptyTaskListDocument(),
  },
  {
    id: "code-block",
    section: "structure",
    title: "Code Block",
    description: "Monospace block for code snippets.",
    shortcut: "/code",
    icon: Code2,
    keywords: ["code", "snippet", "fence", "pre"],
    createContent: () => emptyCodeBlockDocument(),
  },
  {
    id: "table",
    section: "structure",
    title: "Table",
    description: "Two-column starter table.",
    shortcut: "/table",
    icon: Table2,
    keywords: ["table", "grid", "columns"],
    createContent: () => emptyTableDocument(),
  },
  {
    id: "horizontal-rule",
    section: "structure",
    title: "Divider",
    description: "Insert a divider line.",
    shortcut: "/divider",
    icon: Minus,
    keywords: ["divider", "rule", "horizontal", "separator", "hr"],
    createContent: () => emptyHorizontalRuleDocument(),
  },
  {
    id: "link",
    section: "media",
    title: "Link",
    description: "Insert a markdown link scaffold.",
    shortcut: "/link",
    icon: Link2,
    keywords: ["link", "url", "anchor"],
    createContent: () => createScaffoldDocument("[label](https://example.com)"),
  },
  {
    id: "image",
    section: "media",
    title: "Image",
    description: "Insert a markdown image scaffold.",
    shortcut: "/image",
    icon: ImageIcon,
    keywords: ["image", "media", "photo", "picture"],
    createContent: () => createScaffoldDocument("![alt](https://example.com/image.png)"),
  },
  {
    id: "math-block",
    section: "structure",
    title: "Math Block",
    description: "Display LaTeX equation block.",
    shortcut: "/math",
    icon: Sigma,
    keywords: ["math", "latex", "equation", "formula", "katex"],
    createContent: () => emptyMathBlockDocument(),
  },
];

export function createDateDocument(date: Date): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: DATE_TOKEN_NODE_TYPE, attrs: { date: formatDateLabel(date) } }],
      },
    ],
  };
}

export const querySlashCommand: SlashCommand = {
  id: "query",
  section: "advanced",
  title: "Query",
  description: "Insert a live query that filters pages by properties.",
  shortcut: "/query",
  icon: Database,
  keywords: ["query", "database", "filter", "live", "search", "view"],
  blockType: "query",
  createContent: () => encodeQueryConfig({ filters: [], limit: 20 }) as unknown as JSONContent,
};

export const dateSlashCommands: SlashCommand[] = [
  {
    id: "date-pick",
    section: "dates",
    title: "Pick a date…",
    description: "Choose any date from a calendar.",
    shortcut: "/date",
    icon: CalendarPlus,
    keywords: ["date", "pick", "choose", "calendar", "custom", "any", "specific"],
    custom: "date-picker",
    // Fallback content (today) if inserted without the picker; the menu UI
    // normally intercepts this command and inserts the chosen date instead.
    createContent: () => createDateDocument(getRelativeDate("today")),
  },
  {
    id: "date-today",
    section: "dates",
    title: "Today",
    description: "Insert today's date.",
    shortcut: "/today",
    icon: CalendarDays,
    keywords: ["date", "today", "now"],
    createContent: () => createDateDocument(getRelativeDate("today")),
  },
  {
    id: "date-tomorrow",
    section: "dates",
    title: "Tomorrow",
    description: "Insert tomorrow's date.",
    shortcut: "/tomorrow",
    icon: Calendar,
    keywords: ["date", "tomorrow", "next day"],
    createContent: () => createDateDocument(getRelativeDate("tomorrow")),
  },
  {
    id: "date-yesterday",
    section: "dates",
    title: "Yesterday",
    description: "Insert yesterday's date.",
    shortcut: "/yesterday",
    icon: Calendar,
    keywords: ["date", "yesterday", "previous day"],
    createContent: () => createDateDocument(getRelativeDate("yesterday")),
  },
  {
    id: "date-next-week",
    section: "dates",
    title: "Next Week",
    description: "Insert date one week from now.",
    shortcut: "/nextweek",
    icon: Calendar,
    keywords: ["date", "next week", "week"],
    createContent: () => createDateDocument(getRelativeDate("next-week")),
  },
  {
    id: "date-next-month",
    section: "dates",
    title: "Next Month",
    description: "Insert date one month from now.",
    shortcut: "/nextmonth",
    icon: Calendar,
    keywords: ["date", "next month", "month"],
    createContent: () => createDateDocument(getRelativeDate("next-month")),
  },
  {
    id: "date-next-year",
    section: "dates",
    title: "Next Year",
    description: "Insert date one year from now.",
    shortcut: "/nextyear",
    icon: Calendar,
    keywords: ["date", "next year", "year"],
    createContent: () => createDateDocument(getRelativeDate("next-year")),
  },
];

function setBlockColor(editor: Editor, color: string | null) {
  const nodeType = editor.state.doc.firstChild?.type.name;
  if (nodeType) {
    editor.commands.updateAttributes(nodeType, { color });
  }
}

export const colorSlashCommands: SlashCommand[] = [
  {
    id: "color-gray",
    section: "color",
    title: "Gray",
    description: "Gray background.",
    shortcut: "/gray",
    icon: Paintbrush,
    keywords: ["color", "background", "gray", "grey"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, "gray"),
  },
  {
    id: "color-brown",
    section: "color",
    title: "Brown",
    description: "Brown background.",
    shortcut: "/brown",
    icon: Paintbrush,
    keywords: ["color", "background", "brown"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, "brown"),
  },
  {
    id: "color-orange",
    section: "color",
    title: "Orange",
    description: "Orange background.",
    shortcut: "/orange",
    icon: Paintbrush,
    keywords: ["color", "background", "orange"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, "orange"),
  },
  {
    id: "color-yellow",
    section: "color",
    title: "Yellow",
    description: "Yellow background.",
    shortcut: "/yellow",
    icon: Paintbrush,
    keywords: ["color", "background", "yellow"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, "yellow"),
  },
  {
    id: "color-green",
    section: "color",
    title: "Green",
    description: "Green background.",
    shortcut: "/green",
    icon: Paintbrush,
    keywords: ["color", "background", "green"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, "green"),
  },
  {
    id: "color-blue",
    section: "color",
    title: "Blue",
    description: "Blue background.",
    shortcut: "/blue",
    icon: Paintbrush,
    keywords: ["color", "background", "blue"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, "blue"),
  },
  {
    id: "color-purple",
    section: "color",
    title: "Purple",
    description: "Purple background.",
    shortcut: "/purple",
    icon: Paintbrush,
    keywords: ["color", "background", "purple", "violet"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, "purple"),
  },
  {
    id: "color-pink",
    section: "color",
    title: "Pink",
    description: "Pink background.",
    shortcut: "/pink",
    icon: Paintbrush,
    keywords: ["color", "background", "pink", "red"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, "pink"),
  },
  {
    id: "color-none",
    section: "color",
    title: "No Color",
    description: "Remove background color.",
    shortcut: "/nocolor",
    icon: Paintbrush,
    keywords: ["color", "none", "clear", "remove", "default"],
    createContent: () => emptyDocument(),
    execute: (editor) => setBlockColor(editor, null),
  },
];

export function getSlashQuery(editor: Editor) {
  const { state } = editor;

  if (!state.selection.empty || state.doc.childCount !== 1) {
    return null;
  }

  const firstChild = state.doc.firstChild;
  if (!firstChild || firstChild.type.name !== "paragraph") {
    return null;
  }

  const text = state.doc.textBetween(0, state.doc.content.size, "\n", "\0");
  if (!text.startsWith("/") || text.includes("\n")) {
    return null;
  }

  return text.slice(1);
}

/** Which slash commands a menu offers. "dates" is the journal (date actions only). */
export type SlashScope = "all" | "dates";

export function getFilteredSlashCommands(slashQuery: string | null, scope: SlashScope = "all") {
  const commands =
    scope === "dates"
      ? dateSlashCommands
      : [...slashCommands, ...dateSlashCommands, querySlashCommand, ...colorSlashCommands];
  return filterSlashCommands(commands, slashQuery);
}

export function getGroupedSlashCommands(filteredSlashCommands: SlashCommand[]) {
  return groupSlashCommands(slashCommandSections, filteredSlashCommands);
}
