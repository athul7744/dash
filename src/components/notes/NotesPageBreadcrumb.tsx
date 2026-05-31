"use client";

import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import type { PageNavEntry } from "@/hooks/use-page-nav-stack";

interface NotesPageBreadcrumbProps {
  stack: PageNavEntry[];
  currentTitle: string;
  onNavigate: (pageId: string) => void;
  className?: string;
}

export function NotesPageBreadcrumb({
  stack,
  currentTitle,
  onNavigate,
  className = "",
}: NotesPageBreadcrumbProps) {
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [stack.length, currentTitle]);

  if (stack.length === 0) return null;

  return (
    <nav
      ref={scrollRef}
      aria-label="Page navigation breadcrumb"
      className={`flex max-w-full items-center gap-0.5 overflow-x-auto text-xs text-muted-foreground [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <div className="flex min-w-max items-center gap-0.5">
        {stack.map((entry, idx) => (
          <span key={idx} className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => onNavigate(entry.pageId)}
              className="shrink-0 whitespace-nowrap rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              title={entry.title}
            >
              {entry.title || "Untitled"}
            </button>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
          </span>
        ))}
        <span className="shrink-0 whitespace-nowrap px-1 py-0.5 font-medium text-foreground" title={currentTitle || undefined}>
          {currentTitle}
        </span>
      </div>
    </nav>
  );
}
