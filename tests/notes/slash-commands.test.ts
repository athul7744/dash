/// <reference types="vitest/globals" />

import {
  filterSlashCommands,
  groupSlashCommands,
  type SlashCommandSearchable,
  type SlashCommandSectionDef,
} from "@/lib/notes/slash-command-filter";

function cmd(overrides: Partial<SlashCommandSearchable> & { id: string }): SlashCommandSearchable {
  return {
    section: "basic",
    title: "",
    description: "",
    shortcut: "",
    keywords: [],
    ...overrides,
  };
}

const sections: SlashCommandSectionDef[] = [
  { id: "basic", title: "Basic" },
  { id: "structure", title: "Structure" },
  { id: "dates", title: "Dates" },
  { id: "color", title: "Color" },
];

describe("filterSlashCommands", () => {
  const commands = [
    cmd({ id: "heading1", section: "basic", title: "Heading 1", shortcut: "/h1", keywords: ["heading", "title"] }),
    cmd({ id: "heading2", section: "basic", title: "Heading 2", shortcut: "/h2", keywords: ["heading"] }),
    cmd({ id: "table", section: "structure", title: "Table", shortcut: "/table", keywords: ["grid", "rows"] }),
    cmd({ id: "date-today", section: "dates", title: "Today", shortcut: "/today", keywords: ["date", "today", "now"] }),
    cmd({ id: "color-blue", section: "color", title: "Blue", description: "Blue background.", shortcut: "/blue", keywords: ["color", "background", "blue"] }),
  ];

  it("returns empty array when query is null", () => {
    expect(filterSlashCommands(commands, null)).toEqual([]);
  });

  it("returns all commands when query is empty string", () => {
    expect(filterSlashCommands(commands, "")).toEqual(commands);
  });

  it("returns all commands when query is whitespace only", () => {
    expect(filterSlashCommands(commands, "   ")).toEqual(commands);
  });

  it("filters by title", () => {
    const results = filterSlashCommands(commands, "heading");
    expect(results.map((c) => c.id)).toEqual(["heading1", "heading2"]);
  });

  it("filters by keyword", () => {
    const results = filterSlashCommands(commands, "background");
    expect(results.map((c) => c.id)).toEqual(["color-blue"]);
  });

  it("filters by shortcut", () => {
    const results = filterSlashCommands(commands, "/h1");
    expect(results.map((c) => c.id)).toEqual(["heading1"]);
  });

  it("filters by description", () => {
    const results = filterSlashCommands(commands, "blue background");
    expect(results.map((c) => c.id)).toEqual(["color-blue"]);
  });

  it("is case-insensitive", () => {
    const lower = filterSlashCommands(commands, "heading");
    const upper = filterSlashCommands(commands, "HEADING");
    expect(lower).toEqual(upper);
  });

  it("trims whitespace from query", () => {
    const trimmed = filterSlashCommands(commands, "table");
    const padded = filterSlashCommands(commands, "  table  ");
    expect(trimmed).toEqual(padded);
  });

  it("returns empty array for non-matching query", () => {
    expect(filterSlashCommands(commands, "zzzznonexistent")).toEqual([]);
  });
});

describe("groupSlashCommands", () => {
  const commands = [
    cmd({ id: "heading1", section: "basic", title: "Heading 1" }),
    cmd({ id: "table", section: "structure", title: "Table" }),
    cmd({ id: "heading2", section: "basic", title: "Heading 2" }),
  ];

  it("groups commands by section", () => {
    const grouped = groupSlashCommands(sections, commands);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].id).toBe("basic");
    expect(grouped[0].commands.map((c) => c.id)).toEqual(["heading1", "heading2"]);
    expect(grouped[1].id).toBe("structure");
    expect(grouped[1].commands.map((c) => c.id)).toEqual(["table"]);
  });

  it("omits sections with no matching commands", () => {
    const grouped = groupSlashCommands(sections, commands);
    const sectionIds = grouped.map((g) => g.id);
    expect(sectionIds).not.toContain("dates");
    expect(sectionIds).not.toContain("color");
  });

  it("returns empty array when given no commands", () => {
    expect(groupSlashCommands(sections, [])).toEqual([]);
  });

  it("preserves section order from the sections array", () => {
    const reversed = [...commands].reverse();
    const grouped = groupSlashCommands(sections, reversed);
    expect(grouped[0].id).toBe("basic");
    expect(grouped[1].id).toBe("structure");
  });

  it("preserves extra properties on section objects", () => {
    const extendedSections = [
      { id: "basic" as const, title: "Basic", icon: "icon-basic" },
      { id: "structure" as const, title: "Structure", icon: "icon-structure" },
    ];
    const grouped = groupSlashCommands(extendedSections, commands);
    expect(grouped[0]).toHaveProperty("icon", "icon-basic");
  });
});
