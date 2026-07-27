// The tracker UI renders inside the persistent layout shell (TrackerWorkspace),
// which shows its own view-scoped skeletons; a cold load is covered by
// AppBootSkeleton. The route page is empty, so its loading boundary renders
// nothing — this avoids a skeleton flashing over the persistent workspace when
// switching views.
export default function Loading() {
  return null;
}
