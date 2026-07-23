"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/shared/utils";
import { getTagColorClasses, getTagDotClass } from "@/lib/tasks/colors";

type TagPillItem = {
  id: string;
  name: string;
  color: string;
};

export function TagPillStrip({
  tags,
  className,
  collapsible = false,
  autoCollapseMs = 10000,
  expandOnClick = false,
  useParentScroll = false,
}: {
  tags: TagPillItem[];
  className?: string;
  collapsible?: boolean;
  autoCollapseMs?: number;
  expandOnClick?: boolean;
  useParentScroll?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const collapseTimeoutRef = useRef<number | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const hasTags = tags.length > 0;

  useEffect(() => {
    // Only collapsible strips measure/collapse; when off, `hasOverflow` and
    // `isExpanded` stay inert (the render guards on `collapsible`), so there is
    // nothing to reset here.
    if (!collapsible) return;

    const updateOverflow = () => {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) {
        return;
      }

      const nextHasOverflow = measure.scrollWidth > container.clientWidth;
      setHasOverflow(nextHasOverflow);

      if (!nextHasOverflow) {
        setIsExpanded(false);
      }
    };

    updateOverflow();

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => updateOverflow());

    if (resizeObserver) {
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      if (measureRef.current) {
        resizeObserver.observe(measureRef.current);
      }
    }

    window.addEventListener("resize", updateOverflow);

    return () => {
      window.removeEventListener("resize", updateOverflow);
      resizeObserver?.disconnect();
    };
  }, [collapsible, tags]);

  useEffect(() => {
    if (!collapsible || !hasOverflow || !isExpanded) {
      if (collapseTimeoutRef.current !== null) {
        window.clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
      return;
    }

    collapseTimeoutRef.current = window.setTimeout(() => {
      setIsExpanded(false);
      collapseTimeoutRef.current = null;
    }, autoCollapseMs);

    return () => {
      if (collapseTimeoutRef.current !== null) {
        window.clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
    };
  }, [autoCollapseMs, collapsible, hasOverflow, isExpanded]);

  if (!hasTags) {
    return null;
  }

  const shouldShowBands = collapsible && hasOverflow && !isExpanded;

  return (
    <>
      <div className="pointer-events-none absolute opacity-0" aria-hidden="true">
        <div ref={measureRef} className="flex min-w-max items-center gap-1.5 pr-1">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className={cn(
                "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 py-0 text-[10px] font-medium shadow-none",
                getTagColorClasses(tag.color || "slate"),
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", getTagDotClass(tag.color || "slate"))} />
              {tag.name}
            </span>
          ))}
        </div>
      </div>

      <div ref={containerRef} className={cn(useParentScroll ? "w-max" : "min-w-0", className)}>
        {shouldShowBands ? (
          <div
            onPointerDown={expandOnClick ? (event) => {
              event.preventDefault();
              event.stopPropagation();
            } : undefined}
            onClick={expandOnClick ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsExpanded(true);
            } : undefined}
            className={cn("flex h-5 items-center gap-0.5 rounded-sm", expandOnClick ? "cursor-pointer" : null)}
            aria-label="Expand tags"
          >
            {tags.map((tag) => (
              <span
                key={tag.id}
                className={cn("h-5 w-2.5 shrink-0 rounded-[4px]", getTagDotClass(tag.color || "slate"))}
              />
            ))}
          </div>
        ) : (
          useParentScroll ? (
            <div className="flex min-w-max items-center gap-1.5 pr-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className={cn(
                    "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 py-0 text-[10px] font-medium shadow-none",
                    getTagColorClasses(tag.color || "slate"),
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", getTagDotClass(tag.color || "slate"))} />
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto overscroll-y-none [touch-action:pan-x_pan-y]">
              <div className="flex min-w-max items-center gap-1.5 pr-1">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 py-0 text-[10px] font-medium shadow-none",
                      getTagColorClasses(tag.color || "slate"),
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", getTagDotClass(tag.color || "slate"))} />
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </>
  );
}