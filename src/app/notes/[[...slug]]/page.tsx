// The notes UI lives in the persistent shell rendered by `notes/layout.tsx`
// (see NotesWorkspace), so it survives `[[...slug]]` param changes without a
// full-page skeleton flash. This page segment intentionally renders nothing.
export default function NotesPage() {
  return null;
}
