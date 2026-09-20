// The surface lives in a component so both `/day` (today, and the prerendered
// shell the service worker serves for any date offline) and `/day/<date>` render
// exactly the same thing — it reads the date from the URL either way.
export { DaySurface as default } from "@/components/day/DaySurface";
