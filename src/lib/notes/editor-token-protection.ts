import { escapeHtml } from "@/lib/shared/utils";

const notePageReferenceRegex = /\[\[[^\]]+\]\]/g;
const noteInlineTagRegex = /(^|[\s(])#([a-z0-9][a-z0-9_/-]*)/gi;

export function protectNoteTokens(text: string) {
  const tokens: string[] = [];
  const createPlaceholder = (value: string) => {
    const index = tokens.push(value) - 1;
    return `NOTESCLIPTOK${index}END`;
  };

  const withProtectedReferences = text.replace(notePageReferenceRegex, (match) => createPlaceholder(match));
  const protectedText = withProtectedReferences.replace(noteInlineTagRegex, (_, prefix: string, tag: string) => `${prefix}${createPlaceholder(`#${tag}`)}`);

  return { protectedText, tokens };
}

export function restoreProtectedTokens(value: string, tokens: string[], escape = false) {
  return value.replace(/NOTESCLIPTOK(\d+)END/g, (_, index: string) => {
    const token = tokens[Number(index)] ?? "";
    return escape ? escapeHtml(token) : token;
  });
}

export function normalizeExportedMarkdownTokens(markdown: string) {
  return markdown
    .replace(/\\\[\\\[/g, "[[")
    .replace(/\\\]\\\]/g, "]]")
    .replace(/(^|[\s(])\\#([a-z0-9][a-z0-9_/-]*)/gi, "$1#$2");
}
