"use client";

import { ReactNode, useEffect, useState } from "react";
import { AppSwitcher } from "@/components/AppSwitcher";
import { type AppConfig } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

interface MobileBottomFabsProps {
  app: AppConfig;
  centerContent?: ReactNode;
  centerShellClassName?: string;
  centerUseShell?: boolean;
}

const MOBILE_OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="drawer-content"]',
  '[data-slot="alert-dialog-content"]',
].join(", ");

export function MobileBottomFabs({ app, centerContent, centerShellClassName, centerUseShell = true }: MobileBottomFabsProps) {
  const [hasBlockingOverlay, setHasBlockingOverlay] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateOverlayState = () => {
      setHasBlockingOverlay(Boolean(document.querySelector(MOBILE_OVERLAY_SELECTOR)));
    };

    updateOverlayState();

    const observer = new MutationObserver(() => updateOverlayState());
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-open"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        className={cn(
          "sm:hidden fixed inset-x-0 -bottom-4 z-40 h-32 pointer-events-none transition-opacity duration-200",
          hasBlockingOverlay && "opacity-0"
        )}
        style={{
          background: "linear-gradient(to top, var(--background) 0%, var(--background) 30%, color-mix(in oklch, var(--background) 80%, transparent) 60%, transparent 100%)",
        }}
      />

      <div
        className={cn(
          "sm:hidden fixed z-50 transition-all duration-200",
          hasBlockingOverlay && "pointer-events-none opacity-0 translate-y-2"
        )}
        style={{
          left: "calc(env(safe-area-inset-left, 0px) + var(--app-gutter-x))",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        <AppSwitcher current={app} size="fab" />
      </div>

      {centerContent && (
        <div
          className={cn(
            "sm:hidden fixed inset-x-0 z-50 flex items-center justify-center px-[var(--app-gutter-x)] pointer-events-none transition-all duration-200",
            hasBlockingOverlay && "opacity-0 translate-y-2"
          )}
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            height: "48px",
          }}
        >
          {centerUseShell ? (
            <div
              className={cn(
                "pointer-events-auto flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card shadow-[0_0_40px_8px_rgba(0,0,0,0.5)]",
                centerShellClassName ?? "px-3 py-2"
              )}
            >
              {centerContent}
            </div>
          ) : (
            <div className="pointer-events-auto">{centerContent}</div>
          )}
        </div>
      )}
    </>
  );
}