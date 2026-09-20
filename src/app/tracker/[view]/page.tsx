// The tracker UI lives in the persistent TrackerWorkspace (mounted by
// tracker/layout.tsx), so it survives /tracker/<view> segment changes. This
// route only pins the URL; returning null keeps the workspace from remounting
// and the route loading boundary from flashing on view switches.

/**
 * There are exactly three views, so naming them makes the segment static —
 * prerendered, precacheable, and therefore openable offline on a device that
 * has never visited it. A dynamic segment could only be fetched on demand.
 */
export function generateStaticParams() {
  return [{ view: "week" }, { view: "activity" }, { view: "mood" }];
}

export default function TrackerViewPage() {
  return null;
}
