/**
 * Math clipboard helpers for protecting LaTeX tokens during markdown parsing
 * and restoring them as HTML elements that ProseMirror can parse.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type MathToken = { placeholder: string; html: string };

/**
 * Unescape markdown backslash escapes in LaTeX content.
 * Markdown sources double backslashes (\\alpha → \alpha) which KaTeX
 * would misinterpret as line breaks (\\) followed by text.
 */
function unescapeMarkdownLatex(latex: string): string {
  return latex.replace(/\\\\([a-zA-Z])/g, "\\$1");
}

/**
 * Replaces `$$...$$` and `$...$` in text with placeholders,
 * returning the protected text and a list of tokens with their HTML replacements.
 */
export function protectMathTokens(text: string): { protectedText: string; mathTokens: MathToken[] } {
  const mathTokens: MathToken[] = [];
  let index = 0;

  // Protect block math $$...$$ first (greedy)
  const withBlockProtected = text.replace(/\$\$([^\$]+)\$\$/g, (_match, latex: string) => {
    const placeholder = `MATHBLOCK${index}END`;
    const normalizedLatex = unescapeMarkdownLatex(latex.trim());
    mathTokens.push({
      placeholder,
      html: `<div data-math-block="" data-latex="${escapeHtml(normalizedLatex)}">&#8203;</div>`,
    });
    index++;
    return placeholder;
  });

  // Then protect inline math $...$
  const withAllProtected = withBlockProtected.replace(/(?<!\$)\$([^\$\s][^\$]*?)\$/g, (_match, latex: string) => {
    const placeholder = `MATHINLINE${index}END`;
    const normalizedLatex = unescapeMarkdownLatex(latex.trim());
    mathTokens.push({
      placeholder,
      html: `<span data-math-inline="" data-latex="${escapeHtml(normalizedLatex)}">&#8203;</span>`,
    });
    index++;
    return placeholder;
  });

  return { protectedText: withAllProtected, mathTokens };
}

/**
 * Replaces placeholders back with their HTML representations.
 */
export function restoreMathTokens(html: string, mathTokens: MathToken[]): string {
  let result = html;
  for (const { placeholder, html: mathHtml } of mathTokens) {
    result = result.replace(placeholder, mathHtml);
  }
  return result;
}

/**
 * Serializes a math inline node to markdown: `$latex$`
 */
export function serializeMathInlineToMarkdown(latex: string): string {
  return `$${latex}$`;
}

/**
 * Serializes a math block node to markdown: `$$latex$$`
 */
export function serializeMathBlockToMarkdown(latex: string): string {
  return `$$${latex}$$`;
}
