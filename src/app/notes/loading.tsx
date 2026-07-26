// The notes surface renders inside the persistent layout shell (NotesWorkspace),
// which shows its own scoped skeletons; a cold load is covered by AppBootSkeleton.
// The route page itself is empty, so its loading boundary renders nothing —
// this avoids a full-page skeleton flashing over the persistent pages rail.
export default function Loading() {
  return null;
}
