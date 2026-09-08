"use client";

/**
 * A note page's banner image.
 *
 * The banner is an ordinary page-owned attachment; the page's `properties` JSON
 * records which one it is and where it's cropped. That keeps it schema-free — the
 * `attachments` table has no role column — and means the banner syncs, is listed
 * in the page's attachments, cascades on a hard delete and survives a soft one, so
 * restoring a page from the Trash brings its banner back.
 *
 * Everything the surface needs to decide is here, so the component holds no rules.
 */

import { updateNotePageProperties } from "@/lib/notes/notes";
import { attachFile } from "@/lib/storage/attachments";
import { isAllowed, MAX_ATTACHMENT_BYTES } from "@/lib/storage/paths";
import { fetchRemoteImage, imageFileNameFromUrl } from "@/lib/storage/remote-image";
import type { AttachmentRecord } from "@/lib/powersync/AppSchema";
import type { JsonValue } from "@/lib/shared/types";

/** Centre — what a banner shows until it's repositioned. */
export const DEFAULT_BANNER_ALIGN = 50;

export interface PageBanner {
  /** The attachment holding the image. */
  attachmentId: string;
  /** Which part of a too-tall image is visible, as a vertical percent (0–100). */
  align: number;
}

type PageProperties = Record<string, unknown>;
/** What `updateNotePageProperties` accepts — the page blob is free-form JSON. */
type WritableProperties = Record<string, JsonValue>;

/** Clamp to the 0–100 the CSS position is expressed in, rounded to whole percents. */
export function clampAlign(value: unknown): number {
  const align = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(align)) return DEFAULT_BANNER_ALIGN;
  return Math.min(100, Math.max(0, Math.round(align)));
}

/** The page's banner, or null when it has none. */
export function readPageBanner(properties: PageProperties | null | undefined): PageBanner | null {
  const attachmentId = properties?.banner;
  if (typeof attachmentId !== "string" || !attachmentId.trim()) return null;
  return {
    attachmentId: attachmentId.trim(),
    align: properties?.bannerAlign === undefined ? DEFAULT_BANNER_ALIGN : clampAlign(properties.bannerAlign),
  };
}

/**
 * Set or clear the page's banner. `next: null` clears both keys — the file itself
 * stays, listed in the page's attachments, since it may be an image the page uses
 * elsewhere and a listed file is a smaller loss than deleted bytes.
 */
export function writePageBanner(pageId: string, properties: PageProperties, next: PageBanner | null): void {
  const rest = { ...properties } as WritableProperties;
  delete rest.banner;
  delete rest.bannerAlign;
  if (!next) {
    updateNotePageProperties(pageId, rest);
    return;
  }
  updateNotePageProperties(pageId, {
    ...rest,
    banner: next.attachmentId,
    // The default is what an absent key already means, so don't store it.
    ...(next.align === DEFAULT_BANNER_ALIGN ? {} : { bannerAlign: clampAlign(next.align) }),
  });
}

const MAX_MB = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));

/**
 * Store a picked file as this page's banner image.
 *
 * The pickers validate nothing (`pickImageFiles` hands back whatever was chosen),
 * so the size and type check belongs here — the same place `insertImageFiles` does
 * it for an inline image.
 */
export async function attachBannerFile(pageId: string, file: File): Promise<AttachmentRecord> {
  const mimeType = file.type || "application/octet-stream";
  if (!mimeType.startsWith("image/") || !isAllowed(mimeType, file.size)) {
    throw new Error(`Couldn't use "${file.name}" — images only, up to ${MAX_MB} MB.`);
  }
  return attachFile(file, { pageId }, { fileName: file.name, mimeType });
}

/**
 * Store a remote image as this page's banner.
 *
 * The bytes come through the same proxy as bookmark previews and pasted image
 * URLs, so a banner set from the web is a stored file like any other and renders
 * offline afterwards. Offline, the fetch simply fails and says so.
 */
export async function attachBannerFromUrl(pageId: string, url: string): Promise<AttachmentRecord> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("Enter an image URL starting with http:// or https://");

  const blob = await fetchRemoteImage(trimmed);
  if (!blob) throw new Error("Couldn't fetch that image. Check the link, or try again when you're online.");
  const mimeType = blob.type || "image/jpeg";
  if (!isAllowed(mimeType, blob.size)) throw new Error(`That image is too large — up to ${MAX_MB} MB.`);

  return attachFile(blob, { pageId }, { fileName: imageFileNameFromUrl(trimmed), mimeType });
}

/**
 * The align a vertical drag lands on.
 *
 * Dragging down reveals more of the top of the image, so the focal point moves
 * up — hence the subtraction. The travel is scaled by the visible height, so the
 * whole range is reachable in one gesture whatever the banner's size.
 */
export function nextAlignFromDrag({
  startAlign,
  dy,
  height,
}: {
  startAlign: number;
  dy: number;
  height: number;
}): number {
  if (!height) return clampAlign(startAlign);
  return clampAlign(startAlign - (dy / height) * 100);
}
