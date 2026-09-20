import { DaySurface } from "@/components/day/DaySurface";

// The surface reads its date from the path, so this renders exactly what `/day`
// does. A plain wrapper rather than a re-export: Next can't read a route's
// segment config through `export { X as default } from …`, which silently cost
// `/events/[id]` its prerendering.
export default function DayDatePage() {
  return <DaySurface />;
}
