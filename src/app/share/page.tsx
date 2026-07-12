"use client";

import { useMemo, useState } from "react";
import { usePowerSync } from "@powersync/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildSharedTaskTitle,
  readIncomingSharePayload,
  resolveSharedLink,
} from "@/lib/shared/share";
import { getCurrentUserId } from "@/lib/shared/auth";
import { TaskMetadataEditor } from "@/components/tasks/TaskMetadataEditor";
import { Favicon } from "@/components/tasks/Favicon";

export default function SharePage() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const payload = useMemo(() => readIncomingSharePayload(searchParams), [searchParams]);

  return <ShareReview key={searchKey} payload={payload} />;
}

function ShareReview({ payload }: { payload: ReturnType<typeof readIncomingSharePayload> }) {
  const db = usePowerSync();
  const router = useRouter();
  const resolvedLink = useMemo(() => resolveSharedLink(payload), [payload]);
  const [draftTitle, setDraftTitle] = useState(() =>
    buildSharedTaskTitle(payload, { excludeUrl: resolvedLink || undefined })
  );
  const [link, setLink] = useState(resolvedLink);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const hasSharedContent = Boolean(payload.title || payload.text || payload.url);

  const handleCreateTask = async () => {
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle || isSaving) return;

    setIsSaving(true);

    try {
      const taskId = crypto.randomUUID();
      const userId = await getCurrentUserId();
      const now = new Date().toISOString();

      await db.execute(
        `INSERT INTO tasks (id, user_id, title, priority, link, state, due_date, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [taskId, userId, trimmedTitle, "medium", link.trim() || null, dueDate ? dueDate.toISOString() : null, JSON.stringify(selectedTagIds), now, now]
      );

      router.push("/tasks");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-background px-[var(--app-gutter-x)] py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Share2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Save Task</h1>
            <p className="text-sm text-muted-foreground">Review the shared content, set any metadata, and save it directly to tasks.</p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <label htmlFor="share-draft-title" className="mb-2 block text-sm font-medium text-card-foreground">
            Task title
          </label>
          <textarea
            id="share-draft-title"
            rows={4}
            maxLength={250}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="min-h-[112px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Task title"
          />
          <p className="mt-2 text-xs text-muted-foreground">{draftTitle.length}/250 characters</p>

          <label htmlFor="share-draft-link" className="mb-2 mt-4 block text-sm font-medium text-card-foreground">
            Link
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="shrink-0 text-muted-foreground">
              {link.trim() ? <Favicon url={link} /> : <Link2 className="h-3.5 w-3.5" />}
            </span>
            <input
              id="share-draft-link"
              type="url"
              inputMode="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              className="w-full bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="https://example.com"
            />
          </div>

          <TaskMetadataEditor
            dueDate={dueDate}
            onDueDateChange={setDueDate}
            selectedTagIds={selectedTagIds}
            onSelectedTagIdsChange={setSelectedTagIds}
            density="default"
            dueDateFormat="MMM d, yyyy"
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-card-foreground">Incoming share</h2>

          {!hasSharedContent && (
            <p className="text-sm text-muted-foreground">No share payload was found. Open Dash from the system share sheet to review shared text or links here.</p>
          )}

          {payload.title && (
            <div className="mb-4 rounded-xl border border-border/70 bg-background/70 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Shared title
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{payload.title}</p>
            </div>
          )}

          {payload.text && (
            <div className="mb-4 rounded-xl border border-border/70 bg-background/70 p-4 last:mb-0">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Shared text
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{payload.text}</p>
            </div>
          )}

          {payload.url && (
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" />
                Shared link
              </div>
              <p className="break-all text-sm text-foreground">{payload.url}</p>
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => router.push("/tasks")}>Cancel</Button>
          <Button onClick={handleCreateTask} disabled={!draftTitle.trim() || isSaving}>{isSaving ? "Saving..." : "Save Task"}</Button>
        </div>
      </div>
    </div>
  );
}