import { EventDetailSurface } from "@/components/events/EventDetailSurface";

/**
 * Prerenders one id as a stand-in for all of them. The surface reads the real id
 * off the URL, so the service worker can serve this one page for an event never
 * opened online (see `fallbacks` in sw.ts). Real ids are uuids and still render
 * on demand; this one resolves to no event and shows the "not found" state,
 * which is the honest answer for a URL nobody should land on directly.
 */
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function EventDetailPage() {
  return <EventDetailSurface />;
}
