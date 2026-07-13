"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { APPS } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

/**
 * Bottom app bar: all apps in a horizontally-scrollable pill, each a
 * single-click link. Fixed and reachable on launch without scrolling.
 */
export function AppsFab() {
  const router = useRouter();

  useEffect(() => {
    APPS.forEach((app) => router.prefetch(app.href));
  }, [router]);

  return (
    <>
      {/* Soft scrim behind the bar — blurs and fades into the background at its top edge */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-36 bg-gradient-to-t from-background via-background/85 to-transparent backdrop-blur-sm [mask-image:linear-gradient(to_top,black_45%,transparent)]"
      />
      <div
        className="fixed left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 3.5rem)" }}
      >
      <div className="flex items-center gap-1 overflow-x-auto">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Link
              key={app.id}
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
