"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Download, File as FileIcon, FileText, Files, History, Link2, Network, Orbit, Paperclip, Plus, Trash2 } from "lucide-react";

import type { LinkedNoteReferenceRow, NoteAttachmentRow, NotePageRow } from "@/hooks/use-notes";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/shared/utils";
import { useAttachmentUrl } from "@/hooks/use-attachment-url";
import { attachFile, deleteAttachment, MAX_ATTACHMENT_BYTES } from "@/lib/storage/attachments";

import { attachmentLabel, getPageDescription, parseProperties } from "./utils";
import { DetailsRailCardSkeleton, DetailsSection, PageIcon } from "./ui";
import { Backlinks } from "@/components/links/Backlinks";
import { LocalGraphPanel } from "@/components/notes/graph/LocalGraphPanel";
import { OccurrenceLog } from "@/components/events/OccurrenceLog";
import type { OutlineEntry } from "./types";

// ---------------------------------------------------------------------------
// Summary section — shows text by default, textarea on click
// ---------------------------------------------------------------------------

function SummarySection({
  summaryDraft,
  onSetSummaryDraft,
  selectedTagIdsDraft,
  onPersistSelectedPageProperties,
  isOpen,
  onToggle,
}: {
  summaryDraft: string;
  onSetSummaryDraft: (value: string) => void;
  selectedTagIdsDraft: string[];
  onPersistSelectedPageProperties: (summary: string, tagIds: string[]) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  return (
    <DetailsSection
      title="Summary"
      icon={FileText}
      accentClassName="text-amber-600 dark:text-amber-400"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {isEditing ? (
        <Textarea
          ref={textareaRef}
          value={summaryDraft}
          onChange={(event) => {
            onSetSummaryDraft(event.target.value);
            onPersistSelectedPageProperties(event.target.value, selectedTagIdsDraft);
          }}
          onBlur={() => setIsEditing(false)}
          rows={3}
          placeholder="Add page context"
          className="min-h-20 rounded-lg border-0 bg-muted/50 px-3 py-2 text-[12px] leading-5 shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="w-full rounded-lg px-1 py-1 text-left text-[12px] leading-5 text-muted-foreground transition-colors hover:text-foreground"
        >
          {summaryDraft?.trim() || <span className="text-muted-foreground/40">Add page context…</span>}
        </button>
      )}
    </DetailsSection>
  );
}

type TimestampLabel = {
  relative: string;
  dateOnly: string;
  absolute: string;
} | null;

// ---------------------------------------------------------------------------
// Attachments section — upload, list (image thumbnails), download, delete
// ---------------------------------------------------------------------------

function AttachmentRow({ attachment }: { attachment: NoteAttachmentRow }) {
  const url = useAttachmentUrl(attachment);
  const isImage = (attachment.mime_type ?? "").startsWith("image/");
  const label = attachment.file_name || attachmentLabel(attachment.file_path);
  const pending = attachment.sync_state !== "synced";

  return (
    <div className="group flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-muted/50">
      {isImage && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted">
          <FileIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">{label}</p>
        <p className="truncate text-[11px] leading-5 text-muted-foreground">{pending ? "Uploading…" : "Synced"}</p>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download={label}
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          title="Open"
          aria-label="Open attachment"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      )}
      <button
        type="button"
        onClick={() => void deleteAttachment(attachment)}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
        title="Delete"
        aria-label="Delete attachment"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AttachmentsSection({
  pageId,
  attachments,
  isLoading,
  isOpen,
  onToggle,
}: {
  pageId: string | null;
  attachments: NoteAttachmentRow[];
  isLoading: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !pageId) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        try {
          await attachFile(file, { pageId });
        } catch {
          setError(`Couldn't add "${file.name}" — max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB, images or documents only.`);
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <DetailsSection
      title="Attachments"
      icon={Paperclip}
      accentClassName="text-cyan-600 dark:text-cyan-400"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <input ref={inputRef} type="file" multiple className="hidden" onChange={onPick} />
      <button
        type="button"
        disabled={!pageId || busy}
        onClick={() => inputRef.current?.click()}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        {busy ? "Adding…" : "Add file"}
      </button>
      {error && <p className="mb-2 text-[11px] leading-5 text-red-600 dark:text-red-400">{error}</p>}
      {isLoading ? (
        <div className="space-y-2 animate-stagger">
          <DetailsRailCardSkeleton lines={1} />
          <DetailsRailCardSkeleton lines={1} />
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-[12px] leading-5 text-muted-foreground">No attachments yet.</p>
      ) : (
        <div className="space-y-0.5 animate-stagger">
          {attachments.map((attachment) => (
            <AttachmentRow key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}
    </DetailsSection>
  );
}

type DetailsSectionState = {
  outline: boolean;
  summary: boolean;
  references: boolean;
  attachments: boolean;
  timeline: boolean;
};

type DetailsRailView = "overview" | "connections";

export function NotesDetailsRail({
  selectedPage,
  detailsSectionOpen,
  pageOutline,
  summaryDraft,
  selectedTagIdsDraft,
  linkedReferences,
  selectedPageAttachments,
  createdTimestamp,
  isLoadingLinkedReferences,
  isLoadingAttachments,
  onToggleDetailsSection,
  onSetSummaryDraft,
  onPersistSelectedPageProperties,
  onSetFocusTarget,
  onNavigateToPage,
}: {
  selectedPage: NotePageRow | null;
  detailsSectionOpen: DetailsSectionState;
  pageOutline: OutlineEntry[];
  summaryDraft: string;
  selectedTagIdsDraft: string[];
  linkedReferences: LinkedNoteReferenceRow[];
  selectedPageAttachments: NoteAttachmentRow[];
  createdTimestamp: TimestampLabel;
  isLoadingLinkedReferences: boolean;
  isLoadingAttachments: boolean;
  onToggleDetailsSection: (section: keyof DetailsSectionState) => void;
  onSetSummaryDraft: (value: string) => void;
  onPersistSelectedPageProperties: (summary: string, tagIds: string[]) => void;
  onSetFocusTarget: (target: { blockId: string; placement: "start" | "end" }) => void;
  onNavigateToPage: (pageId: string) => void;
}) {
  const [activeView, setActiveView] = useState<DetailsRailView>("overview");
  const [visibleView, setVisibleView] = useState<DetailsRailView>("overview");
  const [transitionStage, setTransitionStage] = useState<"idle" | "exiting" | "entering">("idle");
  const exitTimerRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);

  const clearTransitionHandles = () => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (enterFrameRef.current !== null) {
      window.cancelAnimationFrame(enterFrameRef.current);
      enterFrameRef.current = null;
    }
  };

  const handleViewChange = (nextView: DetailsRailView) => {
    if (nextView === activeView) {
      return;
    }

    clearTransitionHandles();
    setActiveView(nextView);
    setTransitionStage("exiting");

    exitTimerRef.current = window.setTimeout(() => {
      setVisibleView(nextView);
      setTransitionStage("entering");
      enterFrameRef.current = window.requestAnimationFrame(() => {
        setTransitionStage("idle");
        enterFrameRef.current = null;
      });
      exitTimerRef.current = null;
    }, 140);
  };

  useEffect(() => clearTransitionHandles, []);

  const overviewContent = (
    <div className="divide-y divide-border/20">
      <div className="pb-3">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Created
        </div>
        <p className="mt-1 pl-5 text-[12px] text-foreground/80">
          {createdTimestamp?.relative ?? "Unknown"}
          {createdTimestamp?.absolute && (
            <span className="ml-1.5 text-muted-foreground/70">· {createdTimestamp.absolute}</span>
          )}
        </p>
      </div>

      <div className="py-3">
        <DetailsSection
          title="Outline"
          icon={Files}
          accentClassName="text-slate-600 dark:text-slate-400"
          isOpen={detailsSectionOpen.outline}
          onToggle={() => onToggleDetailsSection("outline")}
        >
          {pageOutline.length === 0 ? (
            <p className="text-[12px] leading-5 text-muted-foreground">No headings yet.</p>
          ) : (
            <div className="space-y-0.5 animate-stagger">
              {pageOutline.map((entry, index) => (
                <button
                  key={`${entry.blockId}-${index}`}
                  type="button"
                  onClick={() => onSetFocusTarget({ blockId: entry.blockId, placement: "start" })}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-muted-foreground transition-smooth hover:bg-accent hover:text-foreground"
                  style={{ paddingLeft: `${8 + entry.indentLevel * 10}px` }}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">H{entry.level}</span>
                  <span className="truncate">{entry.text}</span>
                </button>
              ))}
            </div>
          )}
        </DetailsSection>
      </div>

      <div className="py-3">
        <SummarySection
          summaryDraft={summaryDraft}
          onSetSummaryDraft={onSetSummaryDraft}
          selectedTagIdsDraft={selectedTagIdsDraft}
          onPersistSelectedPageProperties={onPersistSelectedPageProperties}
          isOpen={detailsSectionOpen.summary}
          onToggle={() => onToggleDetailsSection("summary")}
        />
      </div>

      <div className="pt-3">
        <DetailsSection
          title="Timeline"
          icon={History}
          accentClassName="text-violet-600 dark:text-violet-400"
          isOpen={detailsSectionOpen.timeline}
          onToggle={() => onToggleDetailsSection("timeline")}
        >
          {selectedPage ? <OccurrenceLog subjectId={selectedPage.id} /> : null}
        </DetailsSection>
      </div>
    </div>
  );

  const connectionsContent = (
    <div className="divide-y divide-border/20">
      <div className="pb-3">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
          <Network className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          Local graph
        </div>
        {selectedPage ? (
          <LocalGraphPanel pageId={selectedPage.id} onNavigateToPage={onNavigateToPage} />
        ) : null}
      </div>

      <div className="py-3">
        <DetailsSection
          title="Linked references"
          icon={Link2}
          accentClassName="text-sky-600 dark:text-sky-400"
          isOpen={detailsSectionOpen.references}
          onToggle={() => onToggleDetailsSection("references")}
        >
          {isLoadingLinkedReferences ? (
            <div className="space-y-2 animate-stagger">
              <DetailsRailCardSkeleton lines={2} />
              <DetailsRailCardSkeleton lines={3} />
            </div>
          ) : linkedReferences.length === 0 ? (
            <p className="text-[12px] leading-5 text-muted-foreground">No incoming references.</p>
          ) : (
            <div className="space-y-0.5 animate-stagger">
              {linkedReferences.slice(0, 8).map((reference) => (
                <button
                  key={`${reference.source_block_id}-${reference.source_page_id}`}
                  type="button"
                  onClick={() => onNavigateToPage(reference.source_page_id)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                >
                  <PageIcon
                    emoji={(() => { try { return parseProperties(reference.source_page_properties)?.emoji as string | undefined; } catch { return undefined; } })()}
                    className="mt-0.5 h-4 w-4 shrink-0 text-sm leading-none"
                    fallbackClassName="text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-foreground">{reference.source_page_title || "Untitled page"}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{getPageDescription(reference.source_page_properties, reference.source_block_content) || "No description"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedPage ? <Backlinks targetId={selectedPage.id} exclude={["note"]} className="mt-2" /> : null}
        </DetailsSection>
      </div>

      <div className="pt-3">
        <AttachmentsSection
          pageId={selectedPage?.id ?? null}
          attachments={selectedPageAttachments}
          isLoading={isLoadingAttachments}
          isOpen={detailsSectionOpen.attachments}
          onToggle={() => onToggleDetailsSection("attachments")}
        />
      </div>
    </div>
  );

  if (!selectedPage) {
    return null;
  }

  return (
    <div className="animate-fade-slide-in py-1 sm:flex sm:h-full sm:min-h-0 sm:flex-1 sm:flex-col sm:overflow-hidden">
      <div className="space-y-3 pr-1 pb-3 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <p className="text-sm font-semibold text-foreground">Details</p>
        </div>

        <div className="flex gap-0.5 border-b border-border/30 pb-1.5 text-[13px] font-medium text-muted-foreground">
          {([
            ["overview", "Overview", FileText, "text-amber-600 dark:text-amber-400"],
            ["connections", "Connections", Orbit, "text-sky-600 dark:text-sky-400"],
          ] as const).map(([view, label, Icon, iconClassName]) => (
            <button
              key={view}
              type="button"
              onClick={() => handleViewChange(view)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
                activeView === view ? "text-foreground bg-muted/60" : "hover:text-foreground hover:bg-muted/40"
              )}
              aria-pressed={activeView === view}
            >
              <Icon className={cn("h-3.5 w-3.5", activeView === view ? iconClassName : "text-muted-foreground/60")} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div
          className={cn(
            "pl-2 transition-all ease-out motion-reduce:transition-none",
            transitionStage === "exiting" && "-translate-y-0.5 opacity-0 duration-110",
            transitionStage === "entering" && "-translate-y-1 opacity-0 duration-0",
            transitionStage === "idle" && "translate-y-0 opacity-100 duration-180"
          )}
        >
          {visibleView === "overview" ? overviewContent : connectionsContent}
        </div>
      </div>
    </div>
  );
}
