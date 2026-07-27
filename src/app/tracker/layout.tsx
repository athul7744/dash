import { Suspense } from "react";
import type { Metadata } from "next";

import { TrackerWorkspace } from "@/components/tracker/TrackerWorkspace";

export const metadata: Metadata = {
  title: "Tracker | Dash.",
  icons: { icon: "/icon-tracker.svg" },
};

/**
 * The tracker shell lives here, not in the page, so it persists across the
 * `/tracker/<view>` segment changes — the route loading boundary only wraps
 * `children` (an empty page), so switching views never flashes a skeleton.
 */
export default function TrackerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <TrackerWorkspace />
      </Suspense>
      {children}
    </>
  );
}
