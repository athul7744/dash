"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, LayoutDashboard, Logs } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APPS, type AppConfig } from "@/lib/shared/apps";
import { isLogViewerEnabled } from "@/lib/shared/logger";
import { cn } from "@/lib/shared/utils";
import { LogViewerDialog } from "@/components/LogViewerDialog";

interface AppSwitcherProps {
  /** The active app, or omitted on the dashboard where nothing is active. */
  current?: AppConfig;
  /** "sm" for mobile (smaller text), "md" for desktop */
  size?: "sm" | "md" | "fab";
}

export function AppSwitcher({ current, size = "md" }: AppSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const showLogViewer = isLogViewerEnabled();

  useEffect(() => {
    APPS.forEach((app) => {
      if (current && app.id === current.id) return;
      router.prefetch(app.href);
    });
  }, [current, router]);

  const trigger = useMemo(() => {
    if (size === "fab") {
      return (
        <PopoverTrigger
          aria-label="Open app switcher"
          className={cn(
            "inline-flex size-12 items-center justify-center rounded-full border border-border bg-card text-sm shadow-lg transition-all duration-200 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <LayoutDashboard className="h-5 w-5 text-foreground" />
        </PopoverTrigger>
      );
    }

    // The pill variants always render an active app; only the fab omits it.
    if (!current) return null;
    const Icon = current.icon;

    return (
      <PopoverTrigger
        className={cn(
          "flex items-center gap-2 rounded-lg transition-colors hover:bg-accent focus:outline-none",
          size === "md" ? "px-2.5 py-1.5" : "px-2 py-1"
        )}
      >
        <div className={cn("rounded-lg", current.accent.iconBg, size === "md" ? "p-2" : "p-1.5")}>
          <Icon className={cn(current.accent.iconText, size === "md" ? "h-6 w-6" : "h-5 w-5")} />
        </div>
        <h1 className={cn("font-heading font-bold tracking-tight", size === "md" ? "text-2xl" : "text-xl")}>
          {current.name}
          <span className={current.accent.iconText}>.</span>
        </h1>
        <ChevronDown className={cn(
          "text-muted-foreground transition-transform",
          open && "rotate-180",
          size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"
        )} />
      </PopoverTrigger>
    );
  }, [current, open, size]);

  const popoverClassName = size === "fab" ? "w-56 p-1.5 mb-2" : "w-56 p-1.5";
  const popoverSide = size === "fab" ? "top" : "bottom";
  const popoverAlign = size === "fab" ? "start" : "start";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {trigger}

        <PopoverContent align={popoverAlign} side={popoverSide} sideOffset={8} className={popoverClassName}>
          <div className="mb-0.5 flex items-center justify-between px-2 py-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Switch app
            </div>
            <div className="flex items-center gap-1">
              {showLogViewer && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setLogDialogOpen(true);
                  }}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Open logs"
                  title="Open logs"
                >
                  <Logs className="h-3.5 w-3.5" />
                </button>
              )}
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Open dashboard"
                title="Open dashboard"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          {APPS.map((app) => {
            const AppIcon = app.icon;
            const isActive = current?.id === app.id;
            return (
              <Link
                key={app.id}
                href={app.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium"
                    : "hover:bg-accent/50"
                )}
              >
                <div className={cn("rounded-md p-1.5", app.accent.iconBg)}>
                  <AppIcon className={cn("h-4 w-4", app.accent.iconText)} />
                </div>
                <span className="flex-1 font-heading font-semibold tracking-tight">
                  {app.name}<span className={app.accent.iconText}>.</span>
                </span>
                {isActive && <Check className="h-4 w-4 text-muted-foreground" />}
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>

      {showLogViewer && <LogViewerDialog open={logDialogOpen} onOpenChange={setLogDialogOpen} />}
    </>
  );
}
