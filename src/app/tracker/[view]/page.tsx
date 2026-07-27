// The tracker UI lives in the persistent TrackerWorkspace (mounted by
// tracker/layout.tsx), so it survives /tracker/<view> segment changes. This
// route only pins the URL; returning null keeps the workspace from remounting
// and the route loading boundary from flashing on view switches.
export default function TrackerViewPage() {
  return null;
}
