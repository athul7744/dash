import { Suspense } from "react";
import type { Metadata } from "next";

import { NotesWorkspace } from "@/components/notes/page/NotesWorkspace";

export const metadata: Metadata = {
  title: "Notes | Dash.",
  icons: { icon: "/icon-notes.svg" },
};

/**
 * The notes shell lives here, not in the page, so it persists across
 * `[[...slug]]` surface changes (overview / note / graph) — the route loading
 * boundary only wraps `children` (a null page), so the rail never flashes.
 */
export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <NotesWorkspace />
      </Suspense>
      {children}
    </>
  );
}
