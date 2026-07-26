"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, Star, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { AnimatedList, MotionListItem } from "@/components/motion/AnimatedList";
import { TagPillStrip } from "@/components/tags/TagPillStrip";
import {
  NotesOverviewGallerySkeleton,
  NotesOverviewRowsSkeleton,
  NotesOverviewSpineSkeleton,
} from "@/components/notes/NotesPageSkeleton";
import type { OverviewView } from "@/lib/notes/overview-view";
import { SPRING_SOFT } from "@/lib/shared/motion";
import { cn } from "@/lib/shared/utils";
import { getTagDotClass } from "@/lib/tasks/colors";

import { PageIcon } from "./ui";
import { formatTimestampLabel, parseProperties } from "./utils";
import { type NormalizedNotePage, NOTE_OVERVIEW_ACCENT_CLASSES } from "./types";

type ItemProps = {
  page: NormalizedNotePage;
  onSelectPage: (pageId: string) => void;
  onToggleFavorite: (page: NormalizedNotePage) => void;
};

type ListProps = {
  view: OverviewView;
  pages: NormalizedNotePage[];
  onSelectPage: (pageId: string) => void;
  onToggleFavorite: (page: NormalizedNotePage) => void;
};

function isFavorited(page: NormalizedNotePage) {
  return parseProperties(page.properties).favorite === true;
}

function accentFor(page: NormalizedNotePage) {
  const color = page.tags[0]?.color;
  return (color && NOTE_OVERVIEW_ACCENT_CLASSES[color]) || NOTE_OVERVIEW_ACCENT_CLASSES.neutral;
}

/** Non-favorites reveal the star on hover (pointer) / always on touch; favorites stay lit. */
function starRevealClass(isFavorite: boolean) {
  return isFavorite
    ? "opacity-100"
    : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100";
}

function FavoriteStar({
  page,
  isFavorite,
  onToggleFavorite,
  className,
}: {
  page: NormalizedNotePage;
  isFavorite: boolean;
  onToggleFavorite: (page: NormalizedNotePage) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleFavorite(page);
      }}
      whileTap={reduce ? undefined : { scale: 0.82 }}
      transition={SPRING_SOFT}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-muted-foreground transition-smooth hover:text-foreground",
        isFavorite && "text-amber-500 hover:text-amber-500",
        className,
      )}
    >
      <Star className={cn("h-4 w-4", isFavorite && "fill-current")} />
    </motion.button>
  );
}

/* ============================ Shared section chrome ============================ */

export function EmptyState({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 font-serif text-sm text-muted-foreground">
      <Icon className="h-4 w-4 opacity-70" />
      {label}
    </div>
  );
}

export function ShowMoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="rounded-full border border-border/70 bg-card/80 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-smooth hover:border-border hover:text-foreground"
      >
        {label}
      </button>
    </div>
  );
}

/** Sentinel that calls `onVisible` when scrolled into view — drives recent infinite scroll. */
export function InfiniteSentinel({ enabled, onVisible }: { enabled: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisible();
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, onVisible]);

  if (!enabled) return null;
  return <div ref={ref} aria-hidden="true" className="h-4 w-full" />;
}

export function Section({
  icon: Icon,
  iconClass,
  label,
  count,
  collapsed,
  onToggleCollapse,
  accessory,
  isEmpty,
  showLoading,
  loading,
  empty,
  children,
}: {
  icon: LucideIcon;
  iconClass?: string;
  label: string;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  accessory?: ReactNode;
  isEmpty: boolean;
  showLoading: boolean;
  loading: ReactNode;
  empty: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="group -ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-smooth hover:bg-accent/40"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform", collapsed && "-rotate-90")} />
          <Icon className={cn("h-4 w-4 shrink-0", iconClass ?? "text-muted-foreground")} />
          <span className="font-heading text-sm font-semibold text-foreground">{label}</span>
          {count > 0 ? <span className="text-xs tabular-nums text-muted-foreground/70">{count}</span> : null}
        </button>
        {accessory}
      </div>
      <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out", collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100")}>
        <div className="min-h-0 overflow-hidden">
          <div className="pt-4">{isEmpty ? (showLoading ? loading : empty) : children}</div>
        </div>
      </div>
    </section>
  );
}

export function OverviewSkeleton({ view, section }: { view: OverviewView; section: "favorites" | "recent" }) {
  if (view === "rows") return <NotesOverviewRowsSkeleton />;
  if (view === "spine") {
    return section === "favorites" ? (
      <div className="flex flex-wrap gap-2"><NotesOverviewSpineSkeleton pins /></div>
    ) : (
      <NotesOverviewSpineSkeleton />
    );
  }
  return <NotesOverviewGallerySkeleton />;
}

/* ============================ List rows ============================ */

function OverviewPageRow({ page, onSelectPage, onToggleFavorite }: ItemProps) {
  const updated = formatTimestampLabel(page.updated_at)?.relative;
  const isFavorite = isFavorited(page);
  const accent = accentFor(page);

  return (
    <div className="group relative border-b border-border/60 last:border-b-0">
      <Link
        href={`/notes/${page.id}`}
        onClick={() => onSelectPage(page.id)}
        className="absolute inset-0 rounded-lg"
        aria-label={`Open ${page.title || "Untitled page"}`}
      />
      <div className="pointer-events-none relative flex items-start gap-3 rounded-lg px-2 py-2.5 transition-smooth group-hover:bg-accent/40">
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", accent.icon)}>
          <PageIcon emoji={page.emoji} className="h-4 w-4 text-sm leading-none" fallbackClassName="text-current" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="min-w-0 truncate text-[0.9rem] font-medium text-foreground">{page.title || "Untitled page"}</span>
            {page.summary ? (
              <span className="hidden min-w-0 flex-1 truncate text-[0.82rem] text-muted-foreground sm:block">{page.summary}</span>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              {page.tags.length ? <div className="relative hidden sm:block"><TagPillStrip tags={page.tags} /></div> : null}
              {updated ? <span className="hidden text-[0.72rem] tabular-nums text-muted-foreground/80 sm:inline">{updated}</span> : null}
              <FavoriteStar page={page} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} className={cn("pointer-events-auto size-7", starRevealClass(isFavorite))} />
            </div>
          </div>

          {/* Mobile: summary + tags/updated stack below the title (shown inline on desktop above). */}
          <div className="mt-1 space-y-1.5 sm:hidden">
            {page.summary ? <p className="line-clamp-2 text-[0.8rem] leading-snug text-muted-foreground">{page.summary}</p> : null}
            {page.tags.length || updated ? (
              <div className="flex items-center gap-2">
                {page.tags.length ? <div className="relative min-w-0"><TagPillStrip tags={page.tags} /></div> : null}
                {updated ? <span className="shrink-0 text-[0.68rem] tabular-nums text-muted-foreground/70">{updated}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function RowList({ pages, onSelectPage, onToggleFavorite }: Omit<ListProps, "view">) {
  return (
    <AnimatedList className="flex flex-col">
      {pages.map((page) => (
        <MotionListItem key={page.id}>
          <OverviewPageRow page={page} onSelectPage={onSelectPage} onToggleFavorite={onToggleFavorite} />
        </MotionListItem>
      ))}
    </AnimatedList>
  );
}

/* ============================ Soft gallery ============================ */

function OverviewGalleryCard({ page, onSelectPage, onToggleFavorite }: ItemProps) {
  const updated = formatTimestampLabel(page.updated_at)?.relative;
  const isFavorite = isFavorited(page);

  return (
    <article className="group relative h-full">
      <Link
        href={`/notes/${page.id}`}
        onClick={() => onSelectPage(page.id)}
        className="absolute inset-0 rounded-3xl"
        aria-label={`Open ${page.title || "Untitled page"}`}
      />
      <div className="pointer-events-none relative flex h-full min-h-[8rem] flex-col rounded-3xl border border-border/60 bg-muted/40 p-4 shadow-sm transition-smooth group-hover:-translate-y-0.5 group-hover:border-border/80 group-hover:bg-card group-hover:shadow-md sm:min-h-[9rem] sm:p-5 dark:bg-card/80 dark:group-hover:bg-card">
        <div className="flex items-start justify-between gap-2">
          <PageIcon emoji={page.emoji} size={26} className="h-6 w-6 leading-none" fallbackClassName="text-muted-foreground" />
          <FavoriteStar page={page} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} className={cn("pointer-events-auto -mr-1.5 -mt-1 size-8", starRevealClass(isFavorite))} />
        </div>

        <h3 className="mt-3 line-clamp-2 font-heading text-[1.05rem] font-semibold leading-snug text-foreground">{page.title || "Untitled page"}</h3>
        <p className={cn("mt-1.5 line-clamp-4 text-sm leading-relaxed", page.summary ? "text-muted-foreground" : "text-muted-foreground/70")}>
          {page.summary || "Open this page to start writing notes."}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-4">
          {page.tags.length ? (
            <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
              <div className="flex w-max items-center gap-2">
                {page.tags.map((tag) => (
                  <span key={tag.key} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", getTagDotClass(tag.color))} />
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span className="flex-1 text-xs text-muted-foreground/60">No tags</span>
          )}
          {updated ? <span className="shrink-0 text-[0.7rem] tabular-nums text-muted-foreground/70">{updated}</span> : null}
        </div>
      </div>
    </article>
  );
}

function GalleryGrid({ pages, onSelectPage, onToggleFavorite }: Omit<ListProps, "view">) {
  return (
    <AnimatedList className="grid grid-cols-2 gap-3 sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))]">
      {pages.map((page) => (
        <MotionListItem key={page.id}>
          <OverviewGalleryCard page={page} onSelectPage={onSelectPage} onToggleFavorite={onToggleFavorite} />
        </MotionListItem>
      ))}
    </AnimatedList>
  );
}

/* ============================ Time spine ============================ */

function OverviewFavoritePin({ page, onSelectPage, onToggleFavorite }: ItemProps) {
  const accent = accentFor(page);
  return (
    <div className="group relative">
      <Link
        href={`/notes/${page.id}`}
        onClick={() => onSelectPage(page.id)}
        className="absolute inset-0 rounded-full"
        aria-label={`Open ${page.title || "Untitled page"}`}
      />
      <div className="pointer-events-none flex items-center gap-2 rounded-full border border-border/70 bg-card/80 py-1.5 pl-1.5 pr-2.5 transition-smooth group-hover:border-border group-hover:bg-accent/30">
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full", accent.icon)}>
          <PageIcon emoji={page.emoji} className="h-3.5 w-3.5 text-[0.8rem] leading-none" fallbackClassName="text-current" />
        </span>
        <span className="max-w-[11rem] truncate text-sm font-medium text-foreground">{page.title || "Untitled page"}</span>
        <FavoriteStar page={page} isFavorite onToggleFavorite={onToggleFavorite} className="pointer-events-auto size-5" />
      </div>
    </div>
  );
}

function FavoritePins({ pages, onSelectPage, onToggleFavorite }: Omit<ListProps, "view">) {
  return (
    <div className="flex flex-wrap gap-2">
      {pages.map((page) => (
        <OverviewFavoritePin key={page.id} page={page} onSelectPage={onSelectPage} onToggleFavorite={onToggleFavorite} />
      ))}
    </div>
  );
}

function OverviewSpineNode({ page, onSelectPage, onToggleFavorite }: ItemProps) {
  const updated = formatTimestampLabel(page.updated_at)?.relative;
  const isFavorite = isFavorited(page);
  const dotClass = page.tags[0] ? getTagDotClass(page.tags[0].color) : "bg-muted-foreground/50";

  return (
    <div className="group relative pl-7">
      <Link
        href={`/notes/${page.id}`}
        onClick={() => onSelectPage(page.id)}
        className="absolute inset-0 rounded-lg"
        aria-label={`Open ${page.title || "Untitled page"}`}
      />
      <span className={cn("pointer-events-none absolute left-[2px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background", dotClass)} aria-hidden="true" />
      <div className="pointer-events-none">
        <div className="font-mono text-[0.7rem] tabular-nums text-muted-foreground/70">{updated}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <PageIcon emoji={page.emoji} className="h-4 w-4 shrink-0 text-sm leading-none text-muted-foreground" fallbackClassName="text-muted-foreground" />
          <h3 className="min-w-0 truncate font-heading text-[1rem] font-semibold text-foreground">{page.title || "Untitled page"}</h3>
          {page.tags.length ? <div className="relative hidden shrink-0 sm:block"><TagPillStrip tags={page.tags} /></div> : null}
          <FavoriteStar page={page} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} className={cn("pointer-events-auto ml-auto size-7", starRevealClass(isFavorite))} />
        </div>
        {page.summary ? <p className="mt-1 line-clamp-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">{page.summary}</p> : null}
        {/* Mobile: tags below the summary (shown inline on the title row at sm+). */}
        {page.tags.length ? <div className="relative mt-1.5 sm:hidden"><TagPillStrip tags={page.tags} /></div> : null}
      </div>
    </div>
  );
}

function SpineList({ pages, onSelectPage, onToggleFavorite }: Omit<ListProps, "view">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute bottom-3 left-[7px] top-3 w-px bg-border" aria-hidden="true" />
      <AnimatedList className="space-y-5">
        {pages.map((page) => (
          <MotionListItem key={page.id}>
            <OverviewSpineNode page={page} onSelectPage={onSelectPage} onToggleFavorite={onToggleFavorite} />
          </MotionListItem>
        ))}
      </AnimatedList>
    </div>
  );
}

/* ============================ View dispatchers ============================ */

export function FavoritesList({ view, pages, onSelectPage, onToggleFavorite }: ListProps) {
  const props = { pages, onSelectPage, onToggleFavorite };
  if (view === "spine") return <FavoritePins {...props} />;
  if (view === "rows") return <RowList {...props} />;
  return <GalleryGrid {...props} />;
}

export function RecentList({ view, pages, onSelectPage, onToggleFavorite }: ListProps) {
  const props = { pages, onSelectPage, onToggleFavorite };
  if (view === "spine") return <SpineList {...props} />;
  if (view === "rows") return <RowList {...props} />;
  return <GalleryGrid {...props} />;
}
