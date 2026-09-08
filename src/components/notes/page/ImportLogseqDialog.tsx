"use client";

/**
 * Importing a Logseq vault, in four steps: pick → review → map → run.
 *
 * The review step exists because a vault is not uniform — some files are
 * journals, some were imported before, some use syntax that has no equivalent
 * here. Every status shown is computed by actually parsing the file, so it's a
 * fact rather than a guess, and every file is individually tickable.
 *
 * The mapping step runs *after* selection on purpose: it decides which tags and
 * property definitions get created, and those should reflect the files being
 * imported, not files that were deselected.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";
import { FolderOpen, FileText, Loader2, Check, AlertTriangle, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useToast } from "@/components/toast/ToastProvider";
import { FileRow, PropertyRow, TagRow, type PlannedTitle } from "@/components/notes/page/ImportMappingRows";
import { type PropertyType } from "@/components/notes/page/types";
import { pickVaultFiles } from "@/lib/notes/import/pick-markdown-files";
import { createTitleAllocator } from "@/lib/notes/import/title-allocator";
import { normalizeTitleKey } from "@/lib/links/tokens";
import { buildPropertyCensus, type PropertyAction, type PropertyCensusEntry } from "@/lib/notes/import/property-mapping";
import { runMarkdownImport, type ImportResult } from "@/lib/notes/import/run-import";
import { scanVaultFiles, type VaultScan } from "@/lib/notes/import/scan-import";
import { buildTagCensus, type TagCensusEntry, type TagDecision } from "@/lib/notes/import/tag-mapping";
import { ensurePropertyDefinitions } from "@/lib/notes/properties";
import { softDeleteEntity } from "@/lib/shared/trash";
import { yieldToUI } from "@/lib/shared/utils";
import { ensureTagIdsByName } from "@/lib/tasks/tags";

type Phase = "pick" | "scanning" | "review" | "mapping" | "running" | "done";

interface PageRow {
  id: string;
  title: string | null;
  properties: string | null;
}

export function ImportLogseqDialog({
  open,
  onOpenChange,
  hideTrigger = false,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  children?: React.ReactNode;
}) {
  const { toast } = useToast();

  const { data: pages = [] } = useQuery<PageRow>("SELECT id, title, properties FROM pages");
  const { data: definitions = [] } = useQuery<{ id: string; name: string; type: PropertyType }>(
    "SELECT id, name, type FROM property_definitions ORDER BY name ASC",
  );
  const { data: tags = [] } = useQuery<{ id: string; name: string }>("SELECT id, name FROM tags ORDER BY name ASC");

  const [phase, setPhase] = useState<Phase>("pick");
  const [scan, setScan] = useState<VaultScan | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [hideSkipped, setHideSkipped] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [propertyActions, setPropertyActions] = useState<Map<string, PropertyAction>>(new Map());
  const [tagDecisions, setTagDecisions] = useState<Map<string, TagDecision>>(new Map());
  const [tagFolders, setTagFolders] = useState(false);
  const [downloadRemoteImages, setDownloadRemoteImages] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<"idle" | "undoing" | "undone">("idle");

  const { existingTitles, alreadyImported } = useMemo(() => {
    const titles: string[] = [];
    const imported = new Set<string>();
    for (const page of pages) {
      let properties: Record<string, unknown> = {};
      try {
        properties = page.properties ? (JSON.parse(page.properties) as Record<string, unknown>) : {};
      } catch {
        properties = {};
      }
      // System pages (bookmarks/quotes/events/journals) aren't note titles.
      if (properties.kind) continue;
      if (page.title) titles.push(page.title);
      if (typeof properties.importedFrom === "string") imported.add(properties.importedFrom);
    }
    return { existingTitles: titles, alreadyImported: imported };
  }, [pages]);

  const chosen = useMemo(
    () => (scan ? scan.files.filter((file) => selection.has(file.path)) : []),
    [scan, selection],
  );

  const reset = useCallback(() => {
    setPhase("pick");
    setScan(null);
    setSelection(new Set());
    setProgress({ done: 0, total: 0 });
    setPropertyActions(new Map());
    setTagDecisions(new Map());
    setTagFolders(false);
    setDownloadRemoteImages(true);
    setResult(null);
    setError(null);
    setUndoState("idle");
  }, []);

  const handlePick = async (folder: boolean) => {
    const files = await pickVaultFiles({ folder });
    if (files.length === 0) return;
    setPhase("scanning");
    setProgress({ done: 0, total: files.length });
    try {
      const scanned = await scanVaultFiles(files, { alreadyImported }, (done, total) => setProgress({ done, total }));
      setScan(scanned);
      setSelection(new Set(scanned.files.filter((file) => file.selected).map((file) => file.path)));
      setPhase("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read that folder.");
      setPhase("pick");
    }
  };

  /**
   * The title each selected file will actually get.
   *
   * Titles are globally unique, so a clash is resolved with a suffix at write
   * time — silently, unless it's shown here. Allocated in the same order the
   * import walks, so the preview matches what lands.
   */
  const plannedTitles = useMemo(() => {
    const existing = new Set(existingTitles.map((title) => normalizeTitleKey(title)));
    const allocator = createTitleAllocator(existingTitles);
    const planned = new Map<string, PlannedTitle>();
    for (const file of chosen) {
      const base = file.title;
      const title = allocator.allocate(base);
      planned.set(
        file.path,
        title === base
          ? { title }
          : { title, renamedFrom: base, reason: existing.has(normalizeTitleKey(base)) ? "existing" : "batch" },
      );
    }
    return planned;
  }, [chosen, existingTitles]);

  const renamedCount = useMemo(
    () => [...plannedTitles.values()].filter((planned) => planned.renamedFrom).length,
    [plannedTitles],
  );

  const propertyCensus = useMemo(
    () => (phase === "mapping" ? buildPropertyCensus(chosen, definitions) : []),
    [phase, chosen, definitions],
  );

  const tagCensus = useMemo(() => {
    if (phase !== "mapping") return [];
    const inputs = chosen.map((file) => ({
      tagValues: file.properties
        .filter(({ key }) => /^tags?$/i.test(key.trim()))
        .map(({ value }) => value),
      hashtags: file.hashtags,
    }));
    return buildTagCensus(inputs, tags, [...existingTitles, ...chosen.map((file) => file.title)]);
  }, [phase, chosen, tags, existingTitles]);

  const goToMapping = () => {
    setPhase("mapping");
    // Seeded from the suggestions; every row stays overridable.
    setPropertyActions(new Map());
    setTagDecisions(new Map());
  };

  const propertyActionFor = (entry: PropertyCensusEntry) => propertyActions.get(entry.keyId) ?? entry.suggested;
  const tagDecisionFor = (entry: TagCensusEntry) => tagDecisions.get(entry.valueId) ?? entry.suggested;

  const runImport = async () => {
    setPhase("running");
    setProgress({ done: 0, total: chosen.length });
    setError(null);
    try {
      const actions = new Map(propertyCensus.map((entry) => [entry.keyId, propertyActionFor(entry)]));
      const decisions = new Map(tagCensus.map((entry) => [entry.valueId, tagDecisionFor(entry)]));

      const definitionIds = await ensurePropertyDefinitions(
        [...actions.values()].flatMap((action) =>
          action.kind === "create" ? [{ name: action.name, type: action.type, config: { options: action.options } }] : [],
        ),
      );

      const tagNames = [...decisions.values()].flatMap((decision) =>
        decision.tag && "createName" in decision.tag ? [decision.tag.createName] : [],
      );
      if (tagFolders) {
        for (const file of chosen) {
          const folder = file.path.split("/").slice(0, -1).pop();
          if (folder && folder.toLowerCase() !== "pages") tagNames.push(folder);
        }
      }
      const tagIds = await ensureTagIdsByName(tagNames);

      const imported = await runMarkdownImport(
        chosen,
        scan?.assets ?? { byPath: new Map(), byUniqueName: new Map() },
        { properties: actions, definitionIds, tags: decisions, tagIds, tagFolders, downloadRemoteImages },
        { existingTitles, onProgress: (done, total) => setProgress({ done, total }) },
      );

      setResult(imported);
      setPhase("done");

      if (imported.pageIds.length > 0) {
        toast({
          message: `Imported ${imported.pageIds.length} ${imported.pageIds.length === 1 ? "note" : "notes"}`,
          actionLabel: "Undo",
          onAction: () => void undoImport(imported.pageIds),
          // Undoing a whole vault is a bigger decision than undoing one delete,
          // and this toast sits behind the dialog until it's closed.
          duration: 30_000,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import failed.");
      setPhase("mapping");
    }
  };

  /**
   * Move every page this import created to the Trash.
   *
   * A soft delete, so blocks, tags, links and stored images all survive and each
   * page can be restored individually from `/trash` — the import is reversible
   * without being destroyed.
   */
  const undoImport = async (pageIds: readonly string[]) => {
    if (undoState !== "idle") return;
    setUndoState("undoing");
    for (const [index, pageId] of pageIds.entries()) {
      await softDeleteEntity("note", pageId);
      if ((index + 1) % 25 === 0) await yieldToUI();
    }
    setUndoState("undone");
    toast({ message: `Moved ${pageIds.length} imported ${pageIds.length === 1 ? "note" : "notes"} to Trash` });
  };

  const visibleFiles = scan
    ? scan.files.filter((file) => !hideSkipped || file.status === "ready" || selection.has(file.path))
    : [];
  const readyCount = scan?.files.filter((file) => file.status === "ready").length ?? 0;
  const withNotes = chosen.filter((file) => file.notes.length > 0).length;
  // A remote banner is fetched through the same download step, so it counts here.
  const remoteImageCount = chosen.reduce(
    (total, file) => total + file.remoteImages + (file.banner === "remote" ? 1 : 0),
    0,
  );
  const localImageCount = chosen.reduce((total, file) => total + file.localImages, 0);
  const bannerCount = chosen.filter((file) => file.banner === "local" || file.banner === "remote").length;
  const missingBannerCount = chosen.filter((file) => file.banner === "missing").length;

  const toggle = (path: string) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        if (!next) reset();
      }}
    >
      {hideTrigger ? null : <DialogTrigger render={children as React.ReactElement} />}
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import from Logseq</DialogTitle>
          <DialogDescription>
            {phase === "pick"
              ? "Choose your vault folder so images and links come across too."
              : phase === "review"
                ? "Every file was parsed. Pick what to bring in."
                : phase === "mapping"
                  ? "Decide where properties and tags land."
                  : phase === "done"
                    ? "Done."
                    : "Working…"}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {phase === "pick" ? (
          <div className="flex flex-col gap-3 py-4">
            <Button variant="outline" className="h-auto justify-start gap-3 py-3" onClick={() => void handlePick(true)}>
              <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="flex flex-col items-start text-left">
                <span className="font-medium">Choose a vault folder</span>
                <span className="text-xs text-muted-foreground">
                  Brings images and cross-page links across as well
                </span>
              </span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 py-3" onClick={() => void handlePick(false)}>
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="flex flex-col items-start text-left">
                <span className="font-medium">Choose markdown files</span>
                <span className="text-xs text-muted-foreground">Text only — local images won&apos;t resolve</span>
              </span>
            </Button>
          </div>
        ) : null}

        {phase === "scanning" || phase === "running" ? (
          <div className="flex flex-col gap-3 py-8">
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "scanning" ? "Reading and parsing…" : "Importing…"} {progress.done} of {progress.total}
            </p>
            <ProgressBar
              done={progress.done}
              total={progress.total}
              label={phase === "scanning" ? "Scanning vault" : "Importing notes"}
            />
          </div>
        ) : null}

        {phase === "review" && scan ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {selection.size} of {scan.files.length} selected
                {renamedCount > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {" "}
                    &middot; {renamedCount} renamed to avoid a clash
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <button type="button" className="hover:text-foreground" onClick={() => setHideSkipped((v) => !v)}>
                  {hideSkipped ? "Show skipped" : "Hide skipped"}
                </button>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() =>
                    setSelection(
                      selection.size === readyCount
                        ? new Set()
                        : new Set(scan.files.filter((f) => f.status === "ready").map((f) => f.path)),
                    )
                  }
                >
                  {selection.size === readyCount ? "Select none" : "Select all ready"}
                </button>
              </span>
            </div>
            <div className="-mx-1 flex-1 overflow-y-auto px-1">
              <ul className="divide-y divide-border/50">
                {visibleFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    planned={plannedTitles.get(file.path)}
                    checked={selection.has(file.path)}
                    onToggle={toggle}
                  />
                ))}
              </ul>
            </div>
          </>
        ) : null}

        {phase === "mapping" ? (
          <div className="-mx-1 flex-1 space-y-6 overflow-y-auto px-1">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Properties</h3>
              {propertyCensus.length === 0 ? (
                <p className="text-sm text-muted-foreground">No properties in the selected files.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {propertyCensus.map((entry) => (
                    <PropertyRow
                      key={entry.keyId}
                      entry={entry}
                      action={propertyActionFor(entry)}
                      definitions={definitions}
                      onChange={(action) =>
                        setPropertyActions((current) => new Map(current).set(entry.keyId, action))
                      }
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</h3>
              {tagCensus.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags in the selected files.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {tagCensus.map((entry) => (
                    <TagRow
                      key={entry.valueId}
                      entry={entry}
                      decision={tagDecisionFor(entry)}
                      tags={tags}
                      onChange={(decision) =>
                        setTagDecisions((current) => new Map(current).set(entry.valueId, decision))
                      }
                    />
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-2 border-t border-border/50 pt-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={tagFolders}
                  onChange={(event) => setTagFolders(event.target.checked)}
                  className="h-4 w-4 accent-violet-500"
                />
                Also tag each page with the folder it came from
              </label>
              {localImageCount > 0 ? (
                <p className="text-xs text-muted-foreground/70">
                  {localImageCount} {localImageCount === 1 ? "image" : "images"} from the folder will be stored with
                  their notes.
                </p>
              ) : null}
              {bannerCount > 0 ? (
                <p className="text-xs text-muted-foreground/70">
                  {bannerCount} {bannerCount === 1 ? "page brings" : "pages bring"} a banner image.
                </p>
              ) : null}
              {missingBannerCount > 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {missingBannerCount} {missingBannerCount === 1 ? "page names a banner" : "pages name banners"} the
                  vault no longer holds — those pages arrive without one.
                </p>
              ) : null}
              {remoteImageCount > 0 ? (
                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={downloadRemoteImages}
                    onChange={(event) => setDownloadRemoteImages(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-violet-500"
                  />
                  <span>
                    Download {remoteImageCount} {remoteImageCount === 1 ? "image" : "images"} that live at a URL
                    <span className="block text-xs text-muted-foreground/70">
                      Stores a copy so they work offline and outlive the original link. Slower, and needs a connection.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          </div>
        ) : null}

        {phase === "done" && result ? (
          <div className="flex-1 space-y-3 overflow-y-auto py-2">
            {undoState === "undone" ? (
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Undo2 className="h-4 w-4 text-muted-foreground" />
                Import undone — all {result.pageIds.length} notes are in the Trash, and any of them can be restored
                from there.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 text-emerald-500" />
                Imported {result.pageIds.length} of {chosen.length}.
              </p>
            )}
            {result.failures.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Couldn&apos;t import:</p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {result.failures.map((failure) => (
                    <li key={failure.path}>
                      <span className="text-foreground">{failure.path}</span> — {failure.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {phase === "review" ? (
            <>
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              <Button disabled={selection.size === 0} onClick={goToMapping}>
                Continue ({selection.size})
              </Button>
            </>
          ) : null}
          {phase === "mapping" ? (
            <>
              <Button variant="ghost" onClick={() => setPhase("review")}>
                Back
              </Button>
              <Button onClick={() => void runImport()}>
                Import {chosen.length} {chosen.length === 1 ? "note" : "notes"}
                {withNotes > 0 ? ` · ${withNotes} with notes` : ""}
              </Button>
            </>
          ) : null}
          {phase === "done" ? (
            <>
              {result && result.pageIds.length > 0 && undoState !== "undone" ? (
                <Button
                  variant="ghost"
                  disabled={undoState === "undoing"}
                  onClick={() => void undoImport(result.pageIds)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {undoState === "undoing" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Undoing…
                    </>
                  ) : (
                    <>
                      <Undo2 className="h-4 w-4" />
                      Undo import
                    </>
                  )}
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  onOpenChange?.(false);
                  reset();
                }}
              >
                Close
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
