"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { APPS, getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

/** Dashboard launcher order — Tracker sits in the middle and is centered. */
const DASHBOARD_ORDER = ["events", "bookmarks", "tasks", "tracker", "notes", "quotes"];
const CENTER_APP = "tracker";

/**
 * Bottom app bar: all apps in a horizontally-scrollable pill, each a
 * single-click link. Centered on Tracker so it's reachable on launch; on
 * narrow screens the ends (Bookmarks/Quotes) clip and are reachable by scroll.
 */
export function AppsFab() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    APPS.forEach((app) => router.prefetch(app.href));
  }, [router]);

  // When the bar overflows, scroll so the middle app is centered in view.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      const center = centerRef.current;
      if (!container || !center || container.scrollWidth <= container.clientWidth) return;
      const cRect = container.getBoundingClientRect();
      const tRect = center.getBoundingClientRect();
      container.scrollLeft += tRect.left + tRect.width / 2 - (cRect.left + cRect.width / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      {/* Soft scrim behind the bar — blurs and fades into the background at its top edge */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-36 bg-gradient-to-t from-background via-background/85 to-transparent backdrop-blur-sm [mask-image:linear-gradient(to_top,black_45%,transparent)]"
      />
      <div
        ref={scrollRef}
        className="fixed inset-x-0 z-40 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 3.5rem)" }}
      >
        <div className="mx-auto flex w-max items-center gap-1 px-4">
          {DASHBOARD_ORDER.map((id) => {
            const app = getApp(id);
            const Icon = app.icon;
            return (
              <Link
                key={app.id}
                ref={id === CENTER_APP ? centerRef : undefined}
                href={app.href}
                className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 transition-colors hover:bg-accent"
              >
                <span className={cn("flex size-6 items-center justify-center rounded-lg", app.accent.iconBg)}>
                  <Icon className={cn("h-3.5 w-3.5", app.accent.iconText)} />
                </span>
                <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
                  {app.name}
                  <span className={app.accent.iconText}>.</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
