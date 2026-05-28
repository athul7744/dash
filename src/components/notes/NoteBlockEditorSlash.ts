import type { Editor, JSONContent } from "@tiptap/core";
import { format } from "date-fns";
import { Calendar, Code2, Heading1, Heading2, Heading3, Heading4, Heading5, ImageIcon, Link2, ListTodo, Quote, Sigma, Table2, TextCursorInput, type LucideIcon } from "lucide-react";

export type SlashCommandSection = "basic" | "structure" | "media" | "dates";

export type SlashCommand = {
  id: string;
  section: SlashCommandSection;
  title: string;
  description: string;
  shortcut: string;
  icon: LucideIcon;
  keywords: string[];
  createContent: () => JSONContent;
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
];

export const slashCommands: SlashCommand[] = [
  {
    id: "text",
    section: "basic",
    title: "Text",
    description: "Turn this block into plain text.",
    shortcut: "/text",
    icon: TextCursorInput,
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
    title: "Horizontal Rule",
    description: "Insert a divider block.",
    shortcut: "/divider",
    icon: TextCursorInput,
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

function formatDateToken(date: Date): string {
  return `{${format(date, "MMM d, yyyy")}}`;
}

function createDateDocument(date: Date): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: formatDateToken(date) }] }],
  };
}

function getRelativeDate(offset: "today" | "tomorrow" | "yesterday" | "next-week" | "next-month" | "next-year"): Date {
  const d = new Date();
  switch (offset) {
    case "today": return d;
    case "tomorrow": d.setDate(d.getDate() + 1); return d;
    case "yesterday": d.setDate(d.getDate() - 1); return d;
    case "next-week": d.setDate(d.getDate() + 7); return d;
    case "next-month": d.setMonth(d.getMonth() + 1); return d;
    case "next-year": d.setFullYear(d.getFullYear() + 1); return d;
  }
}

export const dateSlashCommands: SlashCommand[] = [
  {
    id: "date-today",
    section: "dates",
    title: "Today",
    description: "Insert today's date.",
    shortcut: "/today",
    icon: Calendar,
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

export function getFilteredSlashCommands(slashQuery: string | null) {
  if (slashQuery === null) {
    return [];
  }

  const allCommands = [...slashCommands, ...dateSlashCommands];
  const normalizedQuery = slashQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return allCommands;
  }

  return allCommands.filter((command) => {
    const haystack = [command.title, command.description, command.shortcut, ...command.keywords]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function getGroupedSlashCommands(filteredSlashCommands: SlashCommand[]) {
  return slashCommandSections
    .map((section) => ({
      ...section,
      commands: filteredSlashCommands.filter((command) => command.section === section.id),
    }))
    .filter((section) => section.commands.length > 0);
}
