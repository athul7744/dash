"use client";

import { cn } from "@/lib/shared/utils";
import { X, type LucideIcon } from "lucide-react";
import { WheelList } from "./WheelList";

/* ── Toggle pill button ─────────────────────────────────────────── */

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  children?: React.ReactNode;
}

export function ToggleButton({ active, onClick, icon: Icon, children }: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full transition-all duration-300 ease-in-out",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {Icon && <Icon className="h-2.5 w-2.5" />}
      {children}
    </button>
  );
}

/* ── Dismiss (X) button ─────────────────────────────────────────── */

export function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full transition-colors bg-foreground text-background"
    >
      <X className="h-2.5 w-2.5" />
    </button>
  );
}

/* ── Widget header ──────────────────────────────────────────────── */

interface WidgetHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}

export function WidgetHeader({ icon: Icon, title, subtitle, className, children }: WidgetHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-2", className)}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="font-heading text-xs font-semibold text-foreground">{title}</h3>
        {subtitle && <span className="text-[10px] text-muted-foreground tabular-nums">· {subtitle}</span>}
      </div>
      {children && (
        <div className="flex items-center gap-1.5">{children}</div>
      )}
    </div>
  );
}

/* ── Hatched empty state ────────────────────────────────────────── */

export function HatchedEmpty({ id, label, className }: { id: string; label?: string; className?: string }) {
  return (
    <div className={cn("relative rounded-sm overflow-hidden", className)}>
      <svg className="w-full h-full">
        <defs>
          <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.12" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">{label}</span>
      )}
    </div>
  );
}

/* ── Wheel list overlay ─────────────────────────────────────────── */

interface WheelOverlayProps {
  items: { name: string; hours: number; color: string; percentage: number }[];
  onClose: () => void;
}

export function WheelOverlay({ items, onClose }: WheelOverlayProps) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-lg overflow-hidden z-10"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/70" />
      <WheelList items={items} />
    </div>
  );
}

/* ── Activity list item (color dot + name + value) ──────────────── */

interface ActivityItemProps {
  name: string;
  color: string;
  value: string;
}

export function ActivityItem({ name, color, value }: ActivityItemProps) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-foreground font-medium">{name}</span>
      </div>
      <span className="text-muted-foreground tabular-nums">{value}</span>
    </div>
  );
}
