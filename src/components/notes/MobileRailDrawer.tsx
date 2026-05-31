import { useRef } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

const mobileDrawerTriggerClassName = [
  "h-8 rounded-full border border-border/70 bg-card/90 px-3 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-sm",
  "transition-smooth hover:border-border hover:bg-accent hover:text-foreground",
  "dark:bg-card/75",
].join(" ");

export function MobileRailDrawer({
  direction,
  triggerIcon: TriggerIcon,
  triggerLabel,
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  direction: "left" | "right";
  triggerIcon: LucideIcon;
  triggerLabel: string;
  title: string;
  description: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Drawer direction={direction} open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="sm" className={`min-w-0 whitespace-nowrap gap-1.5 ${mobileDrawerTriggerClassName}`}>
          <TriggerIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          {triggerLabel}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="flex h-full flex-col overflow-hidden p-0 transition-smooth" onOpenAutoFocus={(e) => {
        // Move focus to the content container to prevent aria-hidden warning
        // when the trigger button (inside now-hidden content) retains focus.
        e.preventDefault();
        contentRef.current?.focus();
      }}>
        <DrawerHeader className="sr-only">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div ref={contentRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto bg-background px-[var(--app-gutter-x)] py-4 animate-fade-slide-in outline-none">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}