type NotesPageSkeletonMode = "overview" | "editor";

type NotesNavigationRailSkeletonProps = {
  showHeader?: boolean;
};

type NotesDetailsRailSkeletonProps = {
  showHeader?: boolean;
};

type NotesPageSkeletonProps = {
  mode?: NotesPageSkeletonMode;
  showDesktopHeaderRow?: boolean;
};

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function EditorBlockRowSkeleton({ indent = 0, widthClassName = "w-full" }: { indent?: number; widthClassName?: string }) {
  return (
    <div className="flex items-start gap-2 px-1 py-0.5" style={{ marginLeft: indent * 18 }}>
      <div className="relative flex min-h-6 w-5 shrink-0 items-center justify-center self-stretch">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/35" />
      </div>
      <div className="min-w-0 flex-1 space-y-2 pt-1">
        <Bone className={`h-4 ${widthClassName}`} />
        <Bone className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function NotesOverviewGallerySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 animate-stagger sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))]">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex min-h-[8rem] flex-col rounded-3xl border border-border/60 bg-muted/40 p-4 shadow-sm sm:min-h-[9rem] sm:p-5 dark:bg-card/80">
          <div className="flex items-start justify-between">
            <Bone className="h-6 w-6 rounded-md" />
            <Bone className="h-6 w-6 rounded-full" />
          </div>
          <Bone className="mt-3 h-5 w-3/4" />
          <div className="mt-2 space-y-1.5">
            <Bone className="h-3.5 w-full" />
            <Bone className="h-3.5 w-5/6" />
          </div>
          <div className="mt-auto flex items-center gap-2 pt-4">
            <Bone className="h-2 w-2 rounded-full" />
            <Bone className="h-3 w-16" />
            <Bone className="ml-auto h-3 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotesOverviewRowsSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-border/60 px-2 py-2.5 last:border-b-0">
          <Bone className="h-8 w-8 shrink-0 rounded-lg" />
          <Bone className="h-4 w-40" />
          <Bone className="hidden h-3.5 w-1/3 sm:block" />
          <Bone className="ml-auto h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

export function NotesOverviewSpineSkeleton({ pins = false }: { pins?: boolean }) {
  if (pins) {
    return (
      <>
        <Bone className="h-9 w-40 rounded-full" />
        <Bone className="h-9 w-48 rounded-full" />
      </>
    );
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute bottom-3 left-[7px] top-3 w-px bg-muted" aria-hidden="true" />
      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="relative pl-7">
            <span className="absolute left-[2px] top-1.5 h-2.5 w-2.5 rounded-full bg-muted ring-4 ring-background" />
            <Bone className="h-3 w-12" />
            <Bone className="mt-1.5 h-4 w-48" />
            <Bone className="mt-1.5 h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesNavigationRailSectionSkeleton({ itemWidths }: { itemWidths: string[] }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 rounded-lg py-1">
        <div className="flex items-center gap-2.5">
          <Bone className="h-6 w-6 rounded-lg" />
          <Bone className="h-4 w-28" />
        </div>
        <Bone className="h-4 w-4 rounded-full" />
      </div>
      <div className="space-y-2 overflow-hidden pl-8">
        {itemWidths.map((widthClassName, index) => (
          <div key={index} className="rounded-xl bg-muted/95 px-3 py-2.5">
            <Bone className={`h-3 ${widthClassName}`} />
            <div className="mt-2 flex gap-1.5">
              <Bone className="h-5 w-14 rounded-full" />
              <Bone className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotesNavigationRailSkeleton({ showHeader = true }: NotesNavigationRailSkeletonProps) {
  return (
    <div className="space-y-4 py-1">
      {showHeader ? (
        <div className="flex items-center gap-2.5">
          <Bone className="h-6 w-6 rounded-lg" />
          <div className="space-y-2">
            <Bone className="h-4 w-20" />
            <Bone className="h-3 w-24" />
          </div>
        </div>
      ) : null}
      <div className="space-y-2 rounded-2xl bg-muted/35 p-2">
        <NotesNavigationRailSectionSkeleton itemWidths={["w-3/4", "w-5/6"]} />
        <NotesNavigationRailSectionSkeleton itemWidths={["w-full", "w-2/3"]} />
        <NotesNavigationRailSectionSkeleton itemWidths={["w-1/2"]} />
      </div>
    </div>
  );
}

export function NotesEditorMainSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-1.5 pt-1 md:gap-x-2 sm:h-full sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-rows-[auto_auto_auto_minmax(0,1fr)]">
      {/* Back button placeholder — always hidden (matches actual editor) */}
      <div className="hidden" />
      {/* Title */}
      <Bone className="col-start-1 h-10 w-3/4 sm:col-start-2 md:h-14" />
      {/* Mobile star + menu — hidden on desktop */}
      <div className="col-start-2 mt-1 flex items-center justify-self-end gap-1.5 sm:col-start-3 sm:hidden">
        <Bone className="h-8 w-8 rounded-full" />
        <Bone className="h-8 w-8 rounded-full" />
      </div>
      {/* Metadata row: emoji, tag, blocks, backlinks */}
      <div className="col-span-2 flex gap-2 overflow-hidden pl-3 sm:col-span-1 sm:col-start-2 sm:pl-0">
        <Bone className="h-7 w-7 shrink-0 rounded-full" />
        <Bone className="h-7 w-20 rounded-full" />
        <Bone className="h-7 w-24 rounded-full" />
        <Bone className="h-7 w-26 rounded-full" />
      </div>
      {/* Properties collapsed */}
      <div className="col-span-2 flex items-center gap-1 pl-3 sm:col-start-2 sm:col-span-2 sm:pl-0">
        <Bone className="h-3.5 w-3.5 rounded" />
        <Bone className="h-3.5 w-16 rounded" />
      </div>
      {/* Block tree */}
      <div className="col-span-2 space-y-1.5 rounded-2xl bg-muted/20 py-1 pt-2 sm:col-start-2 sm:col-span-2 sm:h-full">
        <EditorBlockRowSkeleton widthClassName="w-4/5" />
        <EditorBlockRowSkeleton indent={1} widthClassName="w-3/4" />
        <EditorBlockRowSkeleton indent={1} widthClassName="w-5/6" />
        <EditorBlockRowSkeleton widthClassName="w-2/3" />
        <EditorBlockRowSkeleton indent={2} widthClassName="w-3/5" />
        <EditorBlockRowSkeleton widthClassName="w-3/4" />
        <EditorBlockRowSkeleton indent={1} widthClassName="w-2/3" />
      </div>
    </div>
  );
}

/** Just the block-tree portion — used as the single editor's own loading state
 * (its header/properties are already rendered by the surrounding layout). */
export function NotesEditorBodySkeleton() {
  return (
    <div className="space-y-1.5 rounded-2xl bg-muted/20 py-1 pt-2">
      <EditorBlockRowSkeleton widthClassName="w-4/5" />
      <EditorBlockRowSkeleton indent={1} widthClassName="w-3/4" />
      <EditorBlockRowSkeleton indent={1} widthClassName="w-5/6" />
      <EditorBlockRowSkeleton widthClassName="w-2/3" />
      <EditorBlockRowSkeleton indent={2} widthClassName="w-3/5" />
      <EditorBlockRowSkeleton widthClassName="w-3/4" />
      <EditorBlockRowSkeleton indent={1} widthClassName="w-2/3" />
    </div>
  );
}

export function NotesDetailsRailSkeleton({ showHeader = true }: NotesDetailsRailSkeletonProps) {
  return (
    <div className="space-y-4 py-1">
      {showHeader ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bone className="h-4 w-4 rounded-full" />
            <Bone className="h-4 w-16" />
          </div>
          <Bone className="h-8 w-20 rounded-full" />
        </div>
      ) : null}
      <div className="space-y-3">
        <Bone className="h-24 w-full rounded-xl" />
        <Bone className="h-12 w-full rounded-xl" />
        <Bone className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Graph-surface skeleton — a dotted, full-bleed canvas with ghost nodes and the
 * floating controls / legend / zoom placeholders, matching `NotesGraphView`
 * (which has no app header of its own).
 */
export function NotesGraphSkeleton() {
  return (
    <div
      className="relative h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-border/60 bg-[var(--graph-bg,var(--card))]"
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 0)",
        backgroundSize: "26px 26px",
      }}
    >
      {/* Ghost nodes + cluster pucks, faintly pulsing. */}
      <div className="absolute inset-0 animate-pulse">
        <span className="absolute left-1/2 top-[22%] h-16 w-16 -translate-x-1/2 rounded-full bg-muted" />
        <span className="absolute left-[26%] top-1/2 h-12 w-12 rounded-full bg-muted" />
        <span className="absolute right-[24%] top-[48%] h-16 w-16 rounded-full bg-muted" />
        <span className="absolute left-[45%] top-[64%] h-8 w-8 rounded-full bg-muted" />
        <span className="absolute left-[53%] top-[75%] h-6 w-6 rounded-full bg-muted" />
        <span className="absolute left-[40%] top-[80%] h-6 w-6 rounded-full bg-muted" />
      </div>

      {/* Controls panel (top-left). */}
      <div className="absolute left-3 top-3 w-52 max-w-[46vw] space-y-3 rounded-xl border border-border/60 bg-popover/90 p-3 shadow-lg backdrop-blur-sm sm:left-4 sm:top-4 sm:w-56">
        <Bone className="h-8 w-full rounded-lg" />
        <div className="flex items-center justify-between"><Bone className="h-3.5 w-20" /><Bone className="h-5 w-9 rounded-full" /></div>
        <div className="flex items-center justify-between"><Bone className="h-3.5 w-24" /><Bone className="h-5 w-9 rounded-full" /></div>
        <div className="h-px bg-border" />
        <Bone className="h-3.5 w-28" />
        <Bone className="h-1.5 w-full rounded-full" />
      </div>

      {/* Legend (top-right). */}
      <div className="absolute right-3 top-3 w-40 max-w-[42vw] space-y-2 rounded-xl border border-border/60 bg-popover/90 p-3 shadow-lg backdrop-blur-sm sm:right-4 sm:top-4 sm:w-44">
        <Bone className="h-3 w-16" />
        <div className="flex items-center gap-2"><Bone className="h-2.5 w-2.5 rounded-full" /><Bone className="h-3.5 w-20" /></div>
        <div className="flex items-center gap-2"><Bone className="h-2.5 w-2.5 rounded-full" /><Bone className="h-3.5 w-14" /></div>
      </div>

      {/* Zoom controls (bottom-right). */}
      <div className="absolute bottom-1 right-4 flex flex-col gap-1 rounded-xl border border-border/60 bg-popover/90 p-1 shadow-lg backdrop-blur-sm sm:bottom-4">
        <Bone className="size-7 rounded-lg" />
        <Bone className="size-7 rounded-lg" />
        <Bone className="size-7 rounded-lg" />
      </div>
    </div>
  );
}

export function NotesPageSkeleton({ mode = "editor", showDesktopHeaderRow = true }: NotesPageSkeletonProps) {
  if (mode === "overview") {
    return (
      <section className="space-y-10 animate-fade-slide-in">
        {Array.from({ length: 2 }).map((_, index) => (
          <section key={index} className="space-y-4">
            <div className="flex items-center gap-2">
              <Bone className="h-4 w-4 rounded-full" />
              <Bone className="h-4 w-28" />
            </div>
            <NotesOverviewGallerySkeleton />
          </section>
        ))}
      </section>
    );
  }

  return (
    <section className="grid gap-4 sm:h-full sm:min-h-0 sm:grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[280px_minmax(0,1fr)_320px] sm:gap-y-2 animate-fade-slide-in">
      {showDesktopHeaderRow ? (
        <>
          <div className="hidden h-9 items-center sm:flex">
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bone className="h-4 w-4 rounded-full" />
                <Bone className="h-4 w-16" />
              </div>
              <Bone className="h-8 w-20 rounded-full" />
            </div>
          </div>

          <div className="hidden h-9 items-center sm:flex">
            <div className="pl-8 md:pl-9">
              <Bone className="h-4 w-28" />
            </div>
          </div>

          <div className="hidden h-9 items-center sm:flex">
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bone className="h-4 w-4 rounded-full" />
                <Bone className="h-4 w-16" />
              </div>
              <Bone className="h-8 w-20 rounded-full" />
            </div>
          </div>
        </>
      ) : null}

      <div className="hidden sm:block sm:min-h-0 sm:overflow-hidden">
        <NotesNavigationRailSkeleton showHeader={false} />
      </div>

      <div className="mx-auto w-full max-w-3xl sm:min-h-0 sm:overflow-hidden">
        <NotesEditorMainSkeleton />
      </div>

      <div className="hidden sm:block sm:min-h-0 sm:overflow-hidden">
        <NotesDetailsRailSkeleton showHeader={false} />
      </div>
    </section>
  );
}