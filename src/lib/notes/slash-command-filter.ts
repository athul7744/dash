export type SlashCommandSection = "basic" | "structure" | "media" | "dates" | "color" | "advanced";

export interface SlashCommandSearchable {
  id: string;
  section: SlashCommandSection;
  title: string;
  description: string;
  shortcut: string;
  keywords: string[];
}

export interface SlashCommandSectionDef {
  id: SlashCommandSection;
  title: string;
}

export function filterSlashCommands<T extends SlashCommandSearchable>(
  commands: T[],
  query: string | null,
): T[] {
  if (query === null) return [];

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return commands;

  return commands.filter((command) => {
    const haystack = [command.title, command.description, command.shortcut, ...command.keywords]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function groupSlashCommands<
  S extends SlashCommandSectionDef,
  T extends SlashCommandSearchable,
>(
  sections: S[],
  commands: T[],
): Array<S & { commands: T[] }> {
  return sections
    .map((section) => ({
      ...section,
      commands: commands.filter((c) => c.section === section.id),
    }))
    .filter((section) => section.commands.length > 0);
}
