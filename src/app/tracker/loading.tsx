"use client";

import { usePathname } from "next/navigation";

import { TrackerLoadingSkeleton } from "@/components/skeletons/TrackerLoadingSkeleton";

// Now that the view is a path segment (/tracker/<view>), the route loading UI
// can read it and show the matching skeleton — a client loading.tsx sees the
// destination pathname during the transition (params aren't available here).
export default function Loading() {
  const seg = usePathname().split("/")[2];
  const view = seg === "activity" || seg === "mood" ? seg : "week";
  return <TrackerLoadingSkeleton view={view} />;
}
