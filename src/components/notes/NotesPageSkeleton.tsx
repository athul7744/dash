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

export function NotesOverviewListSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 animate-stagger sm:gap-4">
      <NotesOverviewCardSkeletonItems />
    </div>
  );
}

export function NotesOverviewCardSkeletonItems() {
  return (
    <>
      <div className="rounded-2xl border border-border/50 bg-card/80 p-3.5 sm:p-4">
        <div className="flex min-h-[11.5rem] flex-col gap-2.5 sm:min-h-[12.5rem] sm:gap-3">
          <div className="flex items-start justify-between gap-2.5">
            <Bone className="h-9 w-9 rounded-xl sm:h-10 sm:w-10" />
            <Bone className="h-7 w-7 rounded-full sm:h-8 sm:w-8" />
          </div>
          <div className="space-y-1.5">
            <Bone className="h-5 w-full" />
            <Bone className="h-5 w-4/5" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-5/6" />
          </div>
          <div className="mt-auto flex gap-1.5 sm:gap-2">
            <Bone className="h-5 w-14 rounded-full sm:h-6 sm:w-16" />
            <Bone className="h-5 w-16 rounded-full sm:h-6 sm:w-20" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card/80 p-3.5 sm:p-4">
        <div className="flex min-h-[11.5rem] flex-col gap-2.5 sm:min-h-[12.5rem] sm:gap-3">
          <div className="flex items-start justify-between gap-2.5">
            <Bone className="h-9 w-9 rounded-xl sm:h-10 sm:w-10" />
            <Bone className="h-7 w-7 rounded-full sm:h-8 sm:w-8" />
          </div>
          <div className="space-y-1.5">
            <Bone className="h-5 w-5/6" />
            <Bone className="h-5 w-3/5" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-4/5" />
          </div>
          <div className="mt-auto flex gap-1.5 sm:gap-2">
            <Bone className="h-5 w-12 rounded-full sm:h-6 sm:w-14" />
            <Bone className="h-5 w-16 rounded-full sm:h-6 sm:w-18" />
          </div>
        </div>
      </div>
    </>
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-4 md:gap-x-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      {/* Back button placeholder — always hidden (matches actual editor) */}
      <div className="hidden" />
      {/* Title */}
      <Bone className="col-start-1 h-12 w-3/4 sm:col-start-2" />
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
      <div className="col-span-2 space-y-1.5 rounded-2xl bg-muted/20 py-1 sm:col-start-2 sm:col-span-2">
        <EditorBlockRowSkeleton widthClassName="w-4/5" />
        <EditorBlockRowSkeleton indent={1} widthClassName="w-3/4" />
        <EditorBlockRowSkeleton indent={1} widthClassName="w-5/6" />
        <EditorBlockRowSkeleton widthClassName="w-2/3" />
        <EditorBlockRowSkeleton indent={2} widthClassName="w-3/5" />
      </div>
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

export function NotesPageSkeleton({ mode = "editor", showDesktopHeaderRow = true }: NotesPageSkeletonProps) {
  if (mode === "overview") {
    return (
      <section className="grid gap-10 sm:grid-cols-2 animate-fade-slide-in">
        {Array.from({ length: 2 }).map((_, index) => (
          <section key={index} className="space-y-4">
            <div className="flex items-center gap-2">
              <Bone className="h-4 w-4 rounded-full" />
              <Bone className="h-4 w-28" />
            </div>
            <NotesOverviewListSkeleton />
          </section>
        ))}
      </section>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-[280px_minmax(0,1fr)_320px] animate-fade-slide-in">
      {showDesktopHeaderRow ? (
        <>
          <div className="hidden h-8 items-center sm:flex">
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bone className="h-4 w-4 rounded-full" />
                <Bone className="h-4 w-16" />
              </div>
              <Bone className="h-8 w-20 rounded-full" />
            </div>
          </div>

          <div className="hidden h-8 items-center sm:flex">
            <div className="pl-8 md:pl-9">
              <Bone className="h-4 w-28" />
            </div>
          </div>

          <div className="hidden h-8 items-center sm:flex">
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

      <div className="hidden sm:block">
        <NotesNavigationRailSkeleton showHeader={false} />
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <NotesEditorMainSkeleton />
      </div>

      <div className="hidden sm:block">
        <NotesDetailsRailSkeleton showHeader={false} />
      </div>
    </section>
  );
}