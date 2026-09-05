"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Link2, Loader2 } from "lucide-react";

import { Favicon } from "@/components/tasks/Favicon";
import { TagSelector } from "@/components/tags/TagSelector";
import { TaskMetadataEditor } from "@/components/tasks/TaskMetadataEditor";
import { Button } from "@/components/ui/button";
import { fetchBookmarkMetadata } from "@/lib/bookmarks/fetch-metadata";
import {
  buildCaptureInput,
  captureResultHref,
  saveCapture,
  type CaptureResult,
} from "@/lib/shared/capture-actions";
import { classifyShare, PLATFORM_LABELS, type CaptureTarget } from "@/lib/shared/capture";
import { getCurrentUserId } from "@/lib/shared/auth";
import { type IncomingSharePayload } from "@/lib/shared/share";
import { getApp } from "@/lib/shared/apps";
import { getLinkHost } from "@/lib/tasks/tasks";
import { cn } from "@/lib/shared/utils";

const TARGET_APP: Record<CaptureTarget, string> = {
  bookmark: "bookmarks",
  quote: "quotes",
  task: "tasks",
  note: "notes",
};

const TARGET_ORDER: CaptureTarget[] = ["bookmark", "quote", "note", "task"];

// Borderless, transparent fields — the app's calm editing style (see QuoteCard
// / notes). No persistent outlines; a soft fill marks focus instead.
const FIELD =
  "w-full rounded-lg bg-transparent px-3 py-2 text-sm text-foreground outline-none transition-colors focus:bg-muted/50 placeholder:text-muted-foreground/50";

const META_DEBOUNCE_MS = 450;

export function CaptureTriage({
  payload,
  mode,
  onClose,
}: {
  payload: IncomingSharePayload;
  mode: "page" | "modal";
  onClose?: () => void;
}) {
  const router = useRouter();
  const classification = useMemo(() => classifyShare(payload), [payload]);

  // Shared field model — one title/text/url reused across every target, so
  // fetched metadata and edits persist when the chip changes.
  const initial = useMemo(() => {
    const link = classification.link;
    const hasLink = Boolean(link);
    const commentary = hasLink && payload.text ? payload.text.split(link).join("").replace(/\s{2,}/g, " ").trim() : "";
    const title = hasLink ? (payload.title && payload.title !== link ? payload.title : "") : payload.title;
    const text = hasLink ? commentary : (payload.text || payload.title).trim();
    return { title, text };
  }, [classification.link, payload]);

  const [target, setTarget] = useState<CaptureTarget>(classification.target);
  const [url, setUrl] = useState(classification.link);
  const [title, setTitle] = useState(initial.title);
  const [text, setText] = useState(initial.text);
  const [author, setAuthor] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<CaptureResult | null>(null);

  // Don't clobber fields the user (or the share payload) already filled.
  const titleEditedRef = useRef(Boolean(initial.title));
  const textEditedRef = useRef(Boolean(initial.text));

  // Auto-fetch page metadata for a URL and fill title/description into the
  // shared fields (which render into whichever chip is active).
  useEffect(() => {
    const u = url.trim();
    if (!u || !getLinkHost(u)) return;
    let cancelled = false;
    // Toggle loading inside the deferred callback (not synchronously in the
    // effect body) to avoid a cascading-render on every keystroke.
    const timer = setTimeout(async () => {
      setMetaLoading(true);
      try {
        const meta = await fetchBookmarkMetadata(u);
        if (cancelled || !meta) return;
        if (!titleEditedRef.current && meta.title?.trim()) setTitle(meta.title.trim());
        if (!textEditedRef.current && meta.description?.trim()) setText(meta.description.trim());
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    }, META_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setMetaLoading(false);
    };
  }, [url]);

  const onTitleChange = (v: string) => {
    titleEditedRef.current = true;
    setTitle(v);
  };
  const onTextChange = (v: string) => {
    textEditedRef.current = true;
    setText(v);
  };

  const canSave =
    target === "bookmark"
      ? url.trim().length > 0
      : target === "task"
        ? title.trim().length > 0
        : target === "quote"
          ? text.trim().length > 0
          : text.trim().length > 0 || title.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (!(await getCurrentUserId())) return; // not signed in — bail (proxy normally prevents this)
      setSaved(await saveCapture(buildCaptureInput(target, { url, title, text, author, dueDate, tags })));
    } finally {
      setSaving(false);
    }
  };

  const handleDone = () => {
    if (mode === "modal") onClose?.();
    else router.push("/");
  };

  const captureAnother = () => {
    setSaved(null);
    setTarget("bookmark");
    setUrl("");
    setTitle("");
    setText("");
    setAuthor("");
    setDueDate(undefined);
    setTags([]);
    titleEditedRef.current = false;
    textEditedRef.current = false;
  };

  if (saved) {
    const app = getApp(saved.appId);
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className={cn("grid h-12 w-12 place-items-center rounded-2xl", app.accent.iconBg)}>
          <Check className={cn("h-6 w-6", app.accent.iconText)} />
        </div>
        <div className="space-y-1">
          <p className="font-serif text-lg text-foreground">Saved to {app.name}</p>
          <p className="text-sm text-muted-foreground">Synced locally — it&apos;ll upload when online.</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Button render={<Link href={captureResultHref(saved)} />}>
            Open {app.name}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={captureAnother}>
            Capture another
          </Button>
          <Button variant="ghost" onClick={handleDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const urlField = (placeholder: string) => (
    <div className="flex items-center gap-2 rounded-lg px-3 transition-colors focus-within:bg-muted/50">
      <span className="shrink-0 text-muted-foreground">
        {url.trim() ? <Favicon url={url} /> : <Link2 className="h-3.5 w-3.5" />}
      </span>
      <input
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      {classification.platform ? (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {PLATFORM_LABELS[classification.platform]}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Target chooser — ghost chips, the active one softly tinted with its app accent */}
      <div className="-mx-1 flex flex-wrap gap-1">
        {TARGET_ORDER.map((t) => {
          const app = getApp(TARGET_APP[t]);
          const active = t === target;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTarget(t)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? cn(app.accent.iconBg, app.accent.iconText)
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <app.icon className="h-4 w-4" />
              {app.name.replace(/s$/, "")}
            </button>
          );
        })}
      </div>

      {metaLoading ? (
        <p className="flex items-center gap-1.5 text-xs italic text-muted-foreground/70">
          <Loader2 className="h-3 w-3 animate-spin" />
          Fetching details…
        </p>
      ) : null}

      {/* Target-specific fields (all bound to the shared title/text/url) */}
      {target === "bookmark" ? (
        <div className="flex flex-col gap-3">
          {urlField("https://example.com")}
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Title (auto-fetched if left blank)"
            className={FIELD}
          />
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={2}
            placeholder="Note (optional)"
            className={cn(FIELD, "resize-none")}
          />
          <TagSelector selectedTagIds={tags} onSelectedTagIdsChange={setTags} density="default" triggerLabel="Tag" />
        </div>
      ) : target === "quote" ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={4}
            placeholder="Quote"
            className={cn(FIELD, "resize-none font-serif text-base")}
          />
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" className={FIELD} />
          {urlField("Source link (optional)")}
        </div>
      ) : target === "task" ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            rows={3}
            placeholder="Task"
            className={cn(FIELD, "resize-none")}
          />
          {urlField("Link (optional)")}
          <TaskMetadataEditor
            dueDate={dueDate}
            onDueDateChange={setDueDate}
            selectedTagIds={tags}
            onSelectedTagIdsChange={setTags}
            density="default"
            dueDateFormat="MMM d, yyyy"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="Note title" className={FIELD} />
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={5}
            placeholder="Write something…"
            className={cn(FIELD, "resize-none")}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={handleDone}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!canSave || saving}>
          {saving ? "Saving…" : `Save to ${getApp(TARGET_APP[target]).name}`}
        </Button>
      </div>
    </div>
  );
}
