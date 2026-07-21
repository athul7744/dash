"use client";

import { type ReactNode, useState } from "react";
import { Settings, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SyncIndicator } from "@/components/SyncIndicator";
import { AppSwitcher } from "@/components/AppSwitcher";
import { SettingsDialog } from "@/components/SettingsDialog";
import { type AppConfig } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

interface AppHeaderProps {
  /** The active app config */
  app: AppConfig;
  /** Desktop-only action buttons rendered to the right of the header */
  actions?: ReactNode;
  /** Extra items inserted at the top of the mobile overflow menu */
  mobileMenuItems?: ReactNode;
  /** Content rendered below the title row (e.g. a filter bar) */
  children?: ReactNode;
}

export function AppHeader({ app, actions, mobileMenuItems, children }: AppHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const Icon = app.icon;

  return (
    <>
      <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-4 border-b border-border bg-background/95 px-[var(--app-gutter-x)] py-4 backdrop-blur-md [touch-action:pan-y]">
        {/* Title & Actions */}
        <div className="flex items-center justify-between">

          {/* === MOBILE === */}
          <div className="flex items-center justify-between w-full sm:hidden">
            {/* Left: Sync */}
            <div className="flex items-center w-12">
              <SyncIndicator />
            </div>
            {/* Center: App branding */}
            <div className="flex items-center gap-2 rounded-lg px-2 py-1">
              <div className={cn("rounded-lg p-1.5", app.accent.iconBg)}>
                <Icon className={cn("h-4.5 w-4.5", app.accent.iconText)} />
              </div>
              <h1 className="font-heading text-lg font-bold tracking-tight text-foreground">
                {app.name}
                <span className={app.accent.iconText}>.</span>
              </h1>
            </div>
            {/* Right: Overflow menu */}
            <div className="flex items-center justify-end w-12">
              <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-full h-8 w-8 hover:bg-accent transition-colors focus:outline-none">
                  <MoreVertical className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-max">
                  {mobileMenuItems ? (
                    <>
                      <div className="flex flex-col gap-1" onClickCapture={() => setMobileMenuOpen(false)}>{mobileMenuItems}</div>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <span>Settings</span>
                    <Settings className="ml-auto h-4 w-4 text-muted-foreground" />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* === DESKTOP === */}
          <div className="hidden sm:flex items-center gap-2">
            <AppSwitcher current={app} size="md" />
            <div className="ml-2 flex">
              <SyncIndicator />
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1">
            {actions}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="rounded-full text-muted-foreground hover:text-foreground"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Optional sub-header content (filters, etc.) */}
        {children}
      </header>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
