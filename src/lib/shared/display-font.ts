/**
 * User-selectable display/heading typeface. The chosen font drives the
 * `--font-heading` CSS variable (see globals.css) via a `data-display-font`
 * attribute on <html>; the default (Fraunces) needs no attribute.
 */
export type DisplayFont = "fraunces" | "hanken" | "lora" | "bricolage";

export const DEFAULT_DISPLAY_FONT: DisplayFont = "fraunces";

export const DISPLAY_FONT_STORAGE_KEY = "display-font";

/** CSS var each option maps to — used only for previewing the face in the UI. */
export const DISPLAY_FONTS: { value: DisplayFont; label: string; cssVar: string }[] = [
  { value: "fraunces", label: "Fraunces", cssVar: "var(--font-fraunces), Georgia, serif" },
  { value: "hanken", label: "Hanken Grotesk", cssVar: "var(--font-hanken), system-ui, sans-serif" },
  { value: "lora", label: "Lora", cssVar: "var(--font-serif), Georgia, serif" },
  { value: "bricolage", label: "Bricolage Grotesque", cssVar: "var(--font-bricolage), system-ui, sans-serif" },
];

export function isDisplayFont(value: unknown): value is DisplayFont {
  return typeof value === "string" && DISPLAY_FONTS.some((f) => f.value === value);
}
