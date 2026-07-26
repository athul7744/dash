"use client";

import { useId, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, FileText, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/shared/utils";
import { SpriteIcon } from "@/components/notes/SpriteIcon";

/**
 * Click handler for a page `<Link>`. A plain left-click opens in-app via
 * `onSelectPage` (a `startTransition` navigation that keeps the persistent
 * shell and shows only the editor's own skeleton — no full-page route
 * skeleton). Modifier / middle clicks fall through to the `href` so
 * open-in-new-tab still works.
 */
export function selectPageOnClick(onSelectPage: (id: string) => void, id: string) {
  return (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onSelectPage(id);
  };
}

export function DetailsSection({
  title,
  icon: Icon,
  accentClassName,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: LucideIcon;
  accentClassName?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = useId();

  return (
    <section className="min-w-0 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 py-0.5 text-left transition-colors hover:text-foreground"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", accentClassName)} />
          <span className="truncate text-[13px] font-medium text-muted-foreground">{title}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`} />
      </button>

      <div
        id={contentId}
        className={`grid grid-cols-[minmax(0,1fr)] overflow-hidden transition-all duration-200 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0" inert={!isOpen}>
          <div
            className={`pt-1.5 transition-all duration-200 ease-out ${isOpen ? "translate-y-0" : "-translate-y-1"}`}
            aria-hidden={!isOpen}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

export function DetailsRailCardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="px-0 py-1">
      <Bone className="h-3 w-28" />
      <div className="mt-2 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Bone key={index} className={`h-3 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

export function PageIcon({ emoji, className, fallbackClassName, size = 16 }: { emoji?: string | null; className?: string; fallbackClassName?: string; size?: number }) {
  if (emoji) {
    return <SpriteIcon name={emoji} size={size} className={cn("shrink-0", className)} />;
  }

  return <FileText className={cn(className, fallbackClassName)} aria-hidden="true" />;
}