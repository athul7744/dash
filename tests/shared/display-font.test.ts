/// <reference types="vitest/globals" />

import {
  DEFAULT_DISPLAY_FONT,
  DISPLAY_FONTS,
  isDisplayFont,
} from "@/lib/shared/display-font";

describe("display-font config", () => {
  it("offers the four expected faces in order", () => {
    expect(DISPLAY_FONTS.map((f) => f.value)).toEqual([
      "fraunces",
      "hanken",
      "lora",
      "bricolage",
    ]);
  });

  it("defaults to one of the offered faces", () => {
    expect(DISPLAY_FONTS.some((f) => f.value === DEFAULT_DISPLAY_FONT)).toBe(true);
  });

  it("isDisplayFont accepts every defined option", () => {
    for (const { value } of DISPLAY_FONTS) {
      expect(isDisplayFont(value)).toBe(true);
    }
  });

  it("isDisplayFont rejects unknown or non-string values", () => {
    for (const value of ["", "comic-sans", "Fraunces", null, undefined, 42, {}, []]) {
      expect(isDisplayFont(value)).toBe(false);
    }
  });

  it("every option maps to a font-family that references a CSS var", () => {
    for (const { cssVar } of DISPLAY_FONTS) {
      expect(cssVar).toMatch(/^var\(--font-[a-z]+\)/);
    }
  });
});
