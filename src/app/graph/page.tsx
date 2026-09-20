"use client";

/**
 * The vault graph — every linked item across every app, as one map.
 *
 * It lives at `/graph` rather than under `/notes` because it maps the whole
 * vault, not the notes app: a task linking a bookmark is a node here. It is also
 * the one surface that hides the app chrome, so it is its own route rather than
 * a mode of the notes workspace, which spends most of its markup on rails the
 * graph never shows.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { NotesGraphView } from "@/components/notes/graph/NotesGraphView";
import { Button } from "@/components/ui/button";
import { graphApp } from "@/lib/shared/destinations";

export default function GraphPage() {
  const router = useRouter();

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
      <main className="min-h-0 flex-1 overflow-hidden px-[var(--app-gutter-x)] py-3 sm:py-4 md:py-6">
        <div className="mx-auto h-full min-h-0 max-w-[1600px]">
          <NotesGraphView
            onOpenPage={(pageId) => router.push(`/notes/${pageId}`)}
            onExit={() => router.push("/notes")}
          />
        </div>
      </main>

      <MobileBottomFabs
        app={graphApp}
        centerUseShell
        centerShellClassName="max-w-[55vw] px-2.5 py-1.5"
        centerContent={
          <Button
            onClick={() => router.push("/notes")}
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-full px-3 text-xs font-medium text-foreground"
            aria-label="Back to overview"
          >
            <ArrowLeft className="h-4 w-4" />
            Overview
          </Button>
        }
      />
    </div>
  );
}
