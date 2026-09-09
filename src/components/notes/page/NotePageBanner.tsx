"use client";

/**
 * A note page's banner image, and the controls that set one.
 *
 * Two exports, because the two states belong in different places: the banner
 * itself sits above the title, while the way to add one is a chip in the header's
 * metadata row — there is nothing to hover over when a page has no banner.
 *
 * Both write through `@/lib/notes/banner`, so the rules (what a valid image is,
 * where the crop is stored, what removing keeps) are stated once, there.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ImagePlus, Loader2, Move, Trash2, Upload, X } from "lucide-react";

import { useToast } from "@/components/toast/ToastProvider";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAttachmentUrl } from "@/hooks/use-attachment-url";
import { useImageSource } from "@/hooks/use-image-source";
import type { NoteAttachmentRow } from "@/hooks/use-notes";
import {
  attachBannerFile,
  attachBannerFromUrl,
  DEFAULT_BANNER_ALIGN,
  nextAlignFromDrag,
  readPageBanner,
  writePageBanner,
} from "@/lib/notes/banner";
import { pickImageFiles } from "@/lib/notes/editor/image-insert";
import { cn } from "@/lib/shared/utils";

type BannerProps = {
  pageId: string;
  pageProperties: Record<string, unknown>;
  /** Every file on the page — the source list for "use an image already here". */
  attachments: NoteAttachmentRow[];
};

/** Icon-only, so three controls sit lightly on top of the image. */
const CONTROL_CLASS =
  "inline-flex size-7 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 disabled:opacity-60";

/** The one thing an icon can't say: that the image is now draggable. */
const HINT_CLASS =
  "pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm";

const CHIP_CLASS =
  "inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-foreground";

// ─── The banner ──────────────────────────────────────────────────────────────

export function NotePageBanner({ pageId, pageProperties, attachments }: BannerProps) {
  const banner = readPageBanner(pageProperties);
  const { url, isPreview, isLoading, isMissing } = useImageSource(banner?.attachmentId);

  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startAlign: number; height: number } | null>(null);
  const [repositioning, setRepositioning] = useState(false);
  const [draftAlign, setDraftAlign] = useState<number | null>(null);

  const stopRepositioning = useCallback(() => {
    dragRef.current = null;
    setDraftAlign(null);
    setRepositioning(false);
  }, []);

  // Escape abandons a reposition wherever the focus is: the drag hands the pointer
  // to the image, so there is nothing obvious to press Escape "on".
  useEffect(() => {
    if (!repositioning) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") stopRepositioning();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [repositioning, stopRepositioning]);

  // A page whose banner file is gone — deleted from the page's files, or not yet
  // synced to this device — shows nothing rather than a broken frame.
  if (!banner || isMissing) return null;

  const align = draftAlign ?? banner.align;

  const commitAlign = () => {
    writePageBanner(pageId, pageProperties, { attachmentId: banner.attachmentId, align });
    stopRepositioning();
  };

  return (
    <div
      ref={frameRef}
      className={cn("note-banner", repositioning && "note-banner-repositioning")}
      onPointerDown={(event) => {
        if (!repositioning || event.button !== 0) return;
        // Never drag from the controls. Pointer capture retargets the click that
        // follows to the capturing element, so capturing here would swallow
        // Save and Cancel entirely.
        if ((event.target as HTMLElement).closest(".note-banner-controls")) return;

        const height = frameRef.current?.getBoundingClientRect().height ?? 0;
        // Capture, so the gesture survives the pointer leaving the frame.
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { startY: event.clientY, startAlign: align, height };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        setDraftAlign(
          nextAlignFromDrag({ startAlign: drag.startAlign, dy: event.clientY - drag.startY, height: drag.height }),
        );
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          decoding={isPreview ? "sync" : "async"}
          style={{ objectPosition: `50% ${align}%` }}
          draggable={false}
        />
      ) : (
        <div
          className="note-banner-placeholder"
          role="img"
          aria-label={isLoading ? "Loading banner" : "Banner unavailable"}
        >
          <span className="note-image-shimmer" aria-hidden />
        </div>
      )}

      <div className="note-banner-controls">
        {repositioning ? (
          <>
            <span className={HINT_CLASS}>
              <Move className="h-3.5 w-3.5" aria-hidden />
              Drag to reposition
            </span>
            <button type="button" className={CONTROL_CLASS} onClick={commitAlign} title="Save" aria-label="Save banner position">
              <Check className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button type="button" className={CONTROL_CLASS} onClick={stopRepositioning} title="Cancel" aria-label="Cancel repositioning">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={CONTROL_CLASS}
              title="Reposition"
              aria-label="Reposition banner"
              onClick={() => {
                setDraftAlign(banner.align);
                setRepositioning(true);
              }}
            >
              <Move className="h-3.5 w-3.5" aria-hidden />
            </button>
            <BannerSourcePopover
              pageId={pageId}
              pageProperties={pageProperties}
              attachments={attachments}
              triggerClassName={CONTROL_CLASS}
              triggerTitle="Replace banner"
              triggerContent={<ImagePlus className="h-3.5 w-3.5" aria-hidden />}
            />
            <button
              type="button"
              className={CONTROL_CLASS}
              title="Remove"
              aria-label="Remove banner"
              onClick={() => writePageBanner(pageId, pageProperties, null)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Adding one ──────────────────────────────────────────────────────────────

/** The header chip that adds a banner. Nothing to show once the page has one. */
export function AddBannerChip({ pageId, pageProperties, attachments }: BannerProps) {
  if (readPageBanner(pageProperties)) return null;

  return (
    <BannerSourcePopover
      pageId={pageId}
      pageProperties={pageProperties}
      attachments={attachments}
      triggerClassName={CHIP_CLASS}
      // The visible "Add banner" stays part of the accessible name.
      triggerTitle="Add banner image"
      triggerContent={
        <>
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          Add banner
        </>
      }
    />
  );
}

function BannerSourcePopover({
  pageId,
  pageProperties,
  attachments,
  triggerClassName,
  triggerTitle,
  triggerContent,
}: BannerProps & { triggerClassName: string; triggerTitle: string; triggerContent: ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const images = attachments.filter((attachment) => (attachment.mime_type ?? "").startsWith("image/"));

  const apply = async (store: () => Promise<string>) => {
    setBusy(true);
    try {
      const attachmentId = await store();
      // A new image starts centred: keeping the old crop would apply a position
      // chosen for a different picture.
      writePageBanner(pageId, pageProperties, { attachmentId, align: DEFAULT_BANNER_ALIGN });
      setUrlDraft("");
      setOpen(false);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : "Couldn't set that banner." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger disabled={busy} className={triggerClassName} title={triggerTitle} aria-label={triggerTitle}>
        {triggerContent}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3">
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60"
          onClick={() => {
            void (async () => {
              const [file] = await pickImageFiles();
              if (file) await apply(async () => (await attachBannerFile(pageId, file)).id);
            })();
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          Upload an image
        </button>

        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const url = urlDraft.trim();
            if (url) void apply(async () => (await attachBannerFromUrl(pageId, url)).id);
          }}
        >
          <Input
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="Paste an image link"
            aria-label="Banner image URL"
            className="h-8 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !urlDraft.trim()}
            className="h-8 shrink-0 rounded-md bg-muted px-2.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            Use
          </button>
        </form>

        {images.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="px-2 text-xs text-muted-foreground">Already on this page</span>
            <div className="grid grid-cols-4 gap-1.5">
              {images.map((attachment) => (
                <AttachmentThumb
                  key={attachment.id}
                  attachment={attachment}
                  disabled={busy}
                  onSelect={() => void apply(async () => attachment.id)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** One picker tile. The row is already in hand, so this needs no lookup of its own. */
function AttachmentThumb({
  attachment,
  disabled,
  onSelect,
}: {
  attachment: NoteAttachmentRow;
  disabled: boolean;
  onSelect: () => void;
}) {
  const url = useAttachmentUrl(attachment);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      title={attachment.file_name ?? "Use as banner"}
      className="aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-border transition-shadow hover:ring-2 hover:ring-ring disabled:opacity-60"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </button>
  );
}
