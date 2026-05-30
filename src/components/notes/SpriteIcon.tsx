import { cn } from "@/lib/shared/utils";

/**
 * Renders a Fluent Emoji icon from the SVG sprite in /icons/fluent-emoji.svg.
 * For emoji strings (detected by high codepoint), renders the emoji directly.
 */
export function SpriteIcon({
  name,
  size = 16,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  // If it's a Unicode emoji, render as text
  if (isEmoji(name)) {
    return (
      <span className={cn("inline-flex items-center justify-center leading-none", className)} style={{ fontSize: size * 0.85 }}>
        {name}
      </span>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <use href={`/icons/fluent-emoji.svg#${name}`} />
    </svg>
  );
}

/** Returns true if the string is a Unicode emoji rather than a lucide icon name. */
export function isEmoji(value: string): boolean {
  return value.length > 0 && value.codePointAt(0)! > 255;
}
