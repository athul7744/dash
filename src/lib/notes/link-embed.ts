/**
 * A link as a card: what a `linkEmbed` block stores and how it reads back.
 *
 * The card is a snapshot, not a live fetch. A note has to open offline and read
 * the same as it did yesterday, so the title, description and host are copied
 * into the block when the embed is made, and the image becomes an attachment
 * owned by that block — the same thing a bookmark does with its `og:image`.
 * Nothing re-fetches on render.
 *
 * Every field but the URL is optional, because metadata is a best effort: a site
 * that blocks the fetch, or an embed made offline, still gets a card — the URL
 * and its host are always enough to show something and to click through.
 */

/** ProseMirror node name for a link card (see LinkEmbedNode). */
export const LINK_EMBED_NODE_TYPE = "linkEmbed";

export interface LinkEmbedAttrs {
  /** The link itself — the only field that always exists. */
  url: string;
  /** Page title at the time the card was made. */
  title: string;
  /** Meta/og description, trimmed to something a card can hold. */
  description: string;
  /** Attachment id of the stored og:image, if there was one and it saved. */
  image: string | null;
  /** Hostname, shown as the card's source line. */
  host: string;
}

/** A description longer than this is a page, not a summary — cut it. */
const MAX_DESCRIPTION = 300;

/** What a metadata lookup can tell us; every field may be missing. */
export interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  host?: string;
}

/**
 * The hostname a card shows, `www.` dropped — it is noise in a source line, and
 * every card would otherwise start with it.
 */
export function embedHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Build a card's stored attributes from a URL and whatever metadata came back.
 *
 * `imageAttachmentId` is passed separately because storing the image can fail on
 * its own — a card without a thumbnail is still a card.
 */
export function buildLinkEmbedAttrs(
  url: string,
  metadata: LinkMetadata | null,
  imageAttachmentId: string | null,
): LinkEmbedAttrs {
  const description = str(metadata?.description);
  return {
    url: url.trim(),
    title: str(metadata?.title),
    description: description.length > MAX_DESCRIPTION ? `${description.slice(0, MAX_DESCRIPTION).trimEnd()}…` : description,
    image: imageAttachmentId,
    host: str(metadata?.host).replace(/^www\./, "") || embedHost(url),
  };
}

/** What a re-fetch produced, when the address changed. */
export interface LinkEmbedRefetch {
  metadata: LinkMetadata | null;
  imageAttachmentId: string | null;
}

/**
 * Apply an edit to a card.
 *
 * The two fields answer different questions, so they behave differently. The
 * title is a label — yours to set, and kept. The URL says which page the card
 * describes, so changing it makes everything else stale: description, host and
 * thumbnail are all re-read from the new page.
 *
 * The one judgement call is the title on a changed address. A title you typed
 * yourself survives; one you left as the old page's is replaced, because it
 * describes a page the card no longer points at.
 *
 * `refetch` is null when nothing was re-read — normally because the address
 * didn't change. The address is carried through regardless: a caller that
 * couldn't re-read should still not silently keep pointing at the old page.
 */
export function mergeLinkEmbedEdit(
  current: LinkEmbedAttrs,
  next: { url: string; title: string },
  refetch: LinkEmbedRefetch | null,
): LinkEmbedAttrs {
  const title = next.title.trim();
  const url = next.url.trim() || current.url;
  if (!refetch) return { ...current, url, host: embedHost(url) || current.host, title };

  const rebuilt = buildLinkEmbedAttrs(url, refetch.metadata, refetch.imageAttachmentId);
  const keptOwnTitle = title !== current.title;
  return { ...rebuilt, title: keptOwnTitle ? title : rebuilt.title };
}

/** Read a node's attrs back, tolerating anything missing or the wrong type. */
export function parseLinkEmbedAttrs(attrs: Record<string, unknown> | null | undefined): LinkEmbedAttrs {
  const url = str(attrs?.url);
  return {
    url,
    title: str(attrs?.title),
    description: str(attrs?.description),
    image: typeof attrs?.image === "string" && attrs.image ? attrs.image : null,
    host: str(attrs?.host) || embedHost(url),
  };
}

/** What the card reads as when there is no title — never a blank card. */
export function linkEmbedLabel(attrs: LinkEmbedAttrs): string {
  return attrs.title || attrs.host || attrs.url;
}

/**
 * The card's plain-text form: its URL.
 *
 * Text extraction feeds edge reconcile and the search index, and markdown export
 * has to round-trip — so a card degrades to the link it was made from rather
 * than to a title that no longer points anywhere. The title rides along for
 * search only (see `linkEmbedSearchText`).
 */
export function linkEmbedText(attrs: LinkEmbedAttrs): string {
  return attrs.url;
}

/** Title, description and URL — what makes a card findable. */
export function linkEmbedSearchText(attrs: LinkEmbedAttrs): string {
  return [attrs.title, attrs.description, attrs.url].filter(Boolean).join(" ");
}

/** Markdown for a card: a plain link, which is what it was before it was a card. */
export function linkEmbedMarkdown(attrs: LinkEmbedAttrs): string {
  const label = linkEmbedLabel(attrs);
  return attrs.url ? `[${label}](${attrs.url})` : "";
}

/**
 * Whether a string is a single URL this can embed.
 *
 * http(s) only: the card exists to show a fetched page, and the metadata route
 * refuses every other scheme anyway.
 */
export function isEmbeddableUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
