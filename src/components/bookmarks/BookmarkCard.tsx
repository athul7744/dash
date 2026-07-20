"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Circle, Copy, ExternalLink, Loader2, RefreshCw, Star, Tag as TagIcon, Trash2 } from "lucide-react";

import { Favicon } from "@/components/tasks/Favicon";
import { TagSelector } from "@/components/tags/TagSelector";
import { useAutosizeTextarea } from "@/hooks/use-autosize-textarea";
import {
  deleteBookmark,
  markRead,
  setTags,
  toggleFavorite,
  updateBookmark,
  type Bookmark,
} from "@/lib/bookmarks/bookmarks";
import { refreshBookmarkTitle } from "@/lib/bookmarks/fetch-metadata";
import { Tag } from "@/lib/powersync/AppSchema";
import { getTagColorClasses } from "@/lib/tasks/colors";
import { getLinkHost } from "@/lib/tasks/tasks";
import { cn } from "@/lib/shared/utils";

const SAVE_DEBOUNCE_MS = 600;
const ACTION_BTN = "grid h-8 w-8 place-items-center rounded-full transition-colors";

/**
 * A single editable bookmark. A top bar holds the favicon (left) and the
 * actions (right): add-tag, refresh details, read/unread, favorite, delete.
 * Below it: the title, an open-link host line, a freeform note, and the
 * selected tags. Title/note are locally controlled and saved debounced (plus
 * on blur); external (synced) changes reconcile only while unfocused so they
 * never yank the caret mid-edit.
 */
export function BookmarkCard({
  bookmark,
  autoFocus = false,
  loading = false,
  allTags,
}: {
  bookmark: Bookmark;
  autoFocus?: boolean;
  /** True while the page's metadata fetch for a freshly-added bookmark is in flight. */
  loading?: boolean;
  /** All tags, for resolving this bookmark's tag ids to names/colors. */
  allTags: Tag[];
}) {
  const [title, setTitle] = useState(bookmark.title);
  const [note, setNote] = useState(bookmark.note);
  const [refetching, setRefetching] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const host = getLinkHost(bookmark.url) ?? bookmark.url;
  const busy = loading || refetching;
  const selectedTags = bookmark.tags
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => Boolean(t));

  // Focus a freshly-added bookmark so the user can adjust the title straight away.
  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile remote changes only when the user isn't editing this card.
  useEffect(() => {
    if (focusedRef.current) return;
    setTitle(bookmark.title);
    setNote(bookmark.note);
  }, [bookmark.title, bookmark.note]);

  // Grow the note field to fit its content (recomputes on width/masonry reflow).
  useAutosizeTextarea(noteRef, note);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const copyUrl = async () => {
    try {
      await navigator.clipboard?.writeText(bookmark.url);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const scheduleSave = (nextTitle: string, nextNote: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void updateBookmark(bookmark.id, { title: nextTitle, note: nextNote });
    }, SAVE_DEBOUNCE_MS);
  };

  const flushSave = () => {
    focusedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    void updateBookmark(bookmark.id, { title, note });
  };

  const refetch = async () => {
    if (busy) return;
    setRefetching(true);
    try {
      await refreshBookmarkTitle(bookmark.id, bookmark.url);
    } finally {
      setRefetching(false);
    }
  };

  return (
    <div className="group relative rounded-2xl border border-border/65 bg-card/60 p-5 transition-colors focus-within:border-border sm:p-6">
      {/* Top bar: favicon + actions */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
          {busy ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin text-sky-600 dark:text-sky-400" />
          ) : (
            <Favicon url={bookmark.url} className="h-5 w-5" />
          )}
        </span>

        <div className="flex items-center gap-0.5">
          <TagSelector
            selectedTagIds={bookmark.tags}
            onSelectedTagIdsChange={(ids) => void setTags(bookmark.id, ids)}
            showSelectedTags={false}
            triggerContent={<TagIcon className="h-4 w-4" />}
            triggerClassName={cn(ACTION_BTN, "text-muted-foreground hover:bg-accent hover:text-foreground")}
          />
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={busy}
            aria-label="Refetch details"
            className={cn(ACTION_BTN, "text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60")}
          >
            <RefreshCw className={cn("h-4 w-4", refetching && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => void markRead(bookmark.id, bookmark.unread)}
            aria-label={bookmark.unread ? "Mark as read" : "Mark as unread"}
            aria-pressed={bookmark.unread}
            className={cn(
              ACTION_BTN,
              "hover:bg-accent",
              bookmark.unread
                ? "text-sky-600 dark:text-sky-400"
                : "text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
            )}
          >
            {bookmark.unread ? <Circle className="h-4 w-4 fill-current" /> : <CheckCircle2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void toggleFavorite(bookmark.id)}
            aria-label={bookmark.favorite ? "Unstar bookmark" : "Star bookmark"}
            aria-pressed={bookmark.favorite}
            className={cn(ACTION_BTN, "hover:bg-accent", bookmark.favorite ? "text-amber-500" : "text-muted-foreground hover:text-amber-500")}
          >
            <Star className={cn("h-4 w-4", bookmark.favorite && "fill-current")} />
          </button>
          <button
            type="button"
            onClick={() => void deleteBookmark(bookmark.id)}
            aria-label="Delete bookmark"
            className={cn(ACTION_BTN, "text-muted-foreground hover:bg-destructive/10 hover:text-destructive")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input
        ref={titleRef}
        value={title}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleSave(e.target.value, note);
        }}
        onBlur={flushSave}
        placeholder="Title"
        className="w-full bg-transparent text-base font-medium leading-snug text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <div className="mt-0.5 flex items-center gap-1">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground transition-colors hover:text-sky-600 dark:hover:text-sky-400"
        >
          <span className="truncate">{host}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <button
          type="button"
          onClick={() => void copyUrl()}
          aria-label="Copy link"
          title={copied ? "Copied" : "Copy link"}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {busy ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs italic text-muted-foreground/70">
          <Loader2 className="h-3 w-3 animate-spin" />
          Fetching details…
        </p>
      ) : null}

      <textarea
        ref={noteRef}
        value={note}
        rows={1}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => {
          setNote(e.target.value);
          scheduleSave(title, e.target.value);
        }}
        onBlur={flushSave}
        placeholder="Add a note…"
        className="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/40"
      />

      {selectedTags.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className={cn(
                "inline-flex h-5 items-center rounded-sm px-1.5 text-[10px] font-medium",
                getTagColorClasses(tag.color || "slate"),
              )}
            >
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
