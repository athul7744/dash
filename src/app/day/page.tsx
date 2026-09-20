import { DaySurface } from "@/components/day/DaySurface";

// Bare `/day` is today. It is also the page the service worker serves for any
// `/day/<date>` it has never seen — the surface reads the date off the URL, so
// one prerendered page covers every date (see `fallbacks` in sw.ts).
export default function DayPage() {
  return <DaySurface />;
}
