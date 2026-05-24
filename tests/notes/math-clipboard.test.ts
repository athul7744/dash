/// <reference types="vitest/globals" />

import { protectMathTokens, restoreMathTokens, serializeMathInlineToMarkdown, serializeMathBlockToMarkdown } from "@/lib/notes/math-clipboard";

describe("math-clipboard", () => {
  describe("protectMathTokens", () => {
    it("protects a single inline math token", () => {
      const { protectedText, mathTokens } = protectMathTokens("The formula $E=mc^2$ is famous.");
      expect(protectedText).not.toContain("$E=mc^2$");
      expect(protectedText).toContain("MATHINLINE");
      expect(mathTokens).toHaveLength(1);
      expect(mathTokens[0].html).toContain('data-math-inline');
      expect(mathTokens[0].html).toContain('data-latex="E=mc^2"');
      expect(mathTokens[0].html).toContain('&#8203;');
    });

    it("protects multiple inline math tokens", () => {
      const { protectedText, mathTokens } = protectMathTokens("Given $a^2 + b^2 = c^2$ and $x = 5$.");
      expect(mathTokens).toHaveLength(2);
      expect(protectedText).not.toContain("$a^2");
      expect(protectedText).not.toContain("$x = 5$");
    });

    it("protects block math tokens", () => {
      const { protectedText, mathTokens } = protectMathTokens("$$\\int_0^\\infty e^{-x} dx$$");
      expect(protectedText).toContain("MATHBLOCK");
      expect(mathTokens).toHaveLength(1);
      expect(mathTokens[0].html).toContain('data-math-block');
      expect(mathTokens[0].html).toContain('data-latex="\\int_0^\\infty e^{-x} dx"');
    });

    it("protects block math before inline math to avoid partial matching", () => {
      const { mathTokens } = protectMathTokens("$$a + b$$ and $c + d$");
      expect(mathTokens).toHaveLength(2);
      expect(mathTokens[0].html).toContain('data-math-block');
      expect(mathTokens[1].html).toContain('data-math-inline');
    });

    it("does not match a lone dollar sign without a closing pair", () => {
      const { mathTokens } = protectMathTokens("The price is $5 today.");
      expect(mathTokens).toHaveLength(0);
    });

    it("does not match dollar signs with only whitespace inside", () => {
      const { mathTokens } = protectMathTokens("$ $ is not math");
      expect(mathTokens).toHaveLength(0);
    });

    it("escapes HTML special characters in latex", () => {
      const { mathTokens } = protectMathTokens("$a < b > c$");
      expect(mathTokens).toHaveLength(1);
      expect(mathTokens[0].html).toContain("&lt;");
      expect(mathTokens[0].html).toContain("&gt;");
      expect(mathTokens[0].html).not.toContain('"a < b');
    });

    it("trims whitespace from latex content", () => {
      const { mathTokens } = protectMathTokens("$$ x + y $$");
      expect(mathTokens).toHaveLength(1);
      expect(mathTokens[0].html).toContain('data-latex="x + y"');
    });

    it("leaves text without math unchanged", () => {
      const input = "No math here, just plain text.";
      const { protectedText, mathTokens } = protectMathTokens(input);
      expect(protectedText).toBe(input);
      expect(mathTokens).toHaveLength(0);
    });

    it("unescapes markdown double backslashes to single for LaTeX commands", () => {
      const { mathTokens } = protectMathTokens("$\\\\sum_{i=0}^n i$");
      expect(mathTokens).toHaveLength(1);
      expect(mathTokens[0].html).toContain('data-latex="\\sum_{i=0}^n i"');
    });

    it("preserves legitimate double backslash (line break) when not followed by letter", () => {
      const { mathTokens } = protectMathTokens("$a \\\\ b$");
      expect(mathTokens).toHaveLength(1);
      // \\\\ in JS source = \\ in the string = double backslash
      // Since \\ is not followed by a letter, it stays as \\
      expect(mathTokens[0].html).toContain('data-latex="a \\\\ b"');
    });
  });

  describe("restoreMathTokens", () => {
    it("restores inline math placeholders to HTML", () => {
      const { protectedText, mathTokens } = protectMathTokens("$x^2$");
      const html = `<p>${protectedText}</p>`;
      const restored = restoreMathTokens(html, mathTokens);
      expect(restored).toContain('<span data-math-inline="" data-latex="x^2">&#8203;</span>');
      expect(restored).not.toContain("MATHINLINE");
    });

    it("restores block math placeholders to HTML", () => {
      const { protectedText, mathTokens } = protectMathTokens("$$y = mx + b$$");
      const html = `<p>${protectedText}</p>`;
      const restored = restoreMathTokens(html, mathTokens);
      expect(restored).toContain('<div data-math-block="" data-latex="y = mx + b">&#8203;</div>');
      expect(restored).not.toContain("MATHBLOCK");
    });

    it("restores multiple tokens in one pass", () => {
      const { protectedText, mathTokens } = protectMathTokens("$a$ and $b$ and $$c$$");
      const html = `<p>${protectedText}</p>`;
      const restored = restoreMathTokens(html, mathTokens);
      expect(restored).toContain('data-latex="a"');
      expect(restored).toContain('data-latex="b"');
      expect(restored).toContain('data-latex="c"');
    });
  });

  describe("serializeMathInlineToMarkdown", () => {
    it("wraps latex in single dollar signs", () => {
      expect(serializeMathInlineToMarkdown("E=mc^2")).toBe("$E=mc^2$");
    });
  });

  describe("serializeMathBlockToMarkdown", () => {
    it("wraps latex in double dollar signs", () => {
      expect(serializeMathBlockToMarkdown("\\sum_{i=0}^n i")).toBe("$$\\sum_{i=0}^n i$$");
    });
  });

  describe("roundtrip: protect then restore", () => {
    it("handles mixed inline and block math in a paragraph", () => {
      const input = "Inline $\\alpha$ and block $$\\beta + \\gamma$$ end.";
      const { protectedText, mathTokens } = protectMathTokens(input);

      // Simulate marked wrapping in <p>
      const html = `<p>${protectedText}</p>`;
      const restored = restoreMathTokens(html, mathTokens);

      expect(restored).toContain('data-math-inline');
      expect(restored).toContain('data-latex="\\alpha"');
      expect(restored).toContain('data-math-block');
      expect(restored).toContain('data-latex="\\beta + \\gamma"');
      expect(restored).not.toContain("MATH");
    });

    it("handles latex with backslash commands and parentheses", () => {
      const input = "Drops time to $O(\\\\alpha(N))$ -> effectively $O(1)$ amortized.";
      const { protectedText, mathTokens } = protectMathTokens(input);

      expect(mathTokens).toHaveLength(2);
      // Double backslash from markdown source is unescaped to single
      expect(mathTokens[0].html).toContain('data-latex="O(\\alpha(N))"');
      expect(mathTokens[1].html).toContain('data-latex="O(1)"');
      expect(protectedText).not.toContain("$");

      const html = `<p>${protectedText}</p>`;
      const restored = restoreMathTokens(html, mathTokens);
      expect(restored).toContain('data-math-inline');
      expect(restored).toContain('data-latex="O(\\alpha(N))"');
      expect(restored).toContain('data-latex="O(1)"');
    });

    it("matches inline math even when surrounded by dollar-like text", () => {
      const input = "The formula is $x + y$.";
      const { mathTokens } = protectMathTokens(input);
      expect(mathTokens).toHaveLength(1);
      expect(mathTokens[0].html).toContain('data-latex="x + y"');
    });
  });
});
