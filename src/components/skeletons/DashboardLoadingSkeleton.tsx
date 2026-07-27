import { SkeletonAurora } from "@/components/ui/skeleton";

/**
 * Route-level loading fallback for the dashboard (`/`). A calm, branded loader
 * that matches the hero's centered stillness — the wordmark fades in and three
 * dots pulse in a gentle wave, over a `SkeletonAurora` accent glow that drifts
 * behind them (the wordmark and dots render above the glow layer). The global
 * `prefers-reduced-motion` block neutralizes all the motion for reduced-motion
 * users.
 *
 * Shared by the route `loading.tsx` and the cold-start boot skeleton (used for
 * `/`, `/login`, `/share`, and any route without a dedicated skeleton).
 */
export function DashboardLoadingSkeleton() {
  return (
    <SkeletonAurora className="absolute inset-0 flex flex-col items-center justify-center gap-5">
      <span className="animate-fade-slide-in font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Dash<span className="text-primary">.</span>
      </span>
      <div className="flex items-center gap-1.5" role="status" aria-label="Loading">
        <span className="size-1.5 rounded-full bg-primary/70 animate-gentle-pulse" style={{ animationDelay: "0ms" }} />
        <span className="size-1.5 rounded-full bg-primary/70 animate-gentle-pulse" style={{ animationDelay: "200ms" }} />
        <span className="size-1.5 rounded-full bg-primary/70 animate-gentle-pulse" style={{ animationDelay: "400ms" }} />
        <span className="sr-only">Loading your dashboard…</span>
      </div>
    </SkeletonAurora>
  );
}
