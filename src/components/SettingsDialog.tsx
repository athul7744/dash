"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell,
  DatabaseZap,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Sun,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ResetLocalDataDialog } from "@/components/ResetLocalDataDialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { createClient } from "@/lib/supabase/client";
import {
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from "@/lib/shared/notifications";
import { cn } from "@/lib/shared/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Responsive Settings surface: centered Dialog on desktop, bottom Drawer on mobile. */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const body = <SettingsBody open={open} onClose={() => onOpenChange(false)} />;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Settings</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto py-1">
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <AccountSection onClose={onClose} />
      <AppearanceSection />
      <NotificationsSection open={open} />
      <DataSection />
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

// ── Account ──────────────────────────────────────────────────────────────────

function AccountSection({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setEmail(data.session?.user.email ?? null);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    await createClient().auth.signOut();
    onClose();
    router.push("/login");
    router.refresh();
  };

  return (
    <SettingsSection title="Account">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Mail className="h-4 w-4 shrink-0" />
        <span className="truncate">{email ?? "—"}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </SettingsSection>
  );
}

// ── Appearance ───────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <SettingsSection title="Appearance">
      <div className="grid grid-cols-3 gap-1.5">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
              aria-pressed={active}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}

// ── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection({ open }: { open: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  // Read the current subscription state whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    getPushSubscriptionState().then((s) => {
      if (active) setState(s);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const handleToggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        await subscribeToPush();
      } else {
        await unsubscribeFromPush();
      }
      setState(await getPushSubscriptionState());
    } finally {
      setBusy(false);
    }
  };

  const unsupported = state === "unsupported";
  const denied = state === "denied";
  const checked = state === "subscribed";

  let hint: string | null = null;
  if (unsupported) hint = "Not supported in this browser.";
  else if (denied) hint = "Blocked — enable notifications in your browser settings.";

  return (
    <SettingsSection title="Notifications">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm text-foreground">Push notifications</p>
            <p className="text-xs text-muted-foreground">
              Tracker reminders and daily task summaries.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={checked}
            onCheckedChange={handleToggle}
            disabled={busy || unsupported || denied || state === null}
          />
        </div>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </SettingsSection>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────

function DataSection() {
  const [showReset, setShowReset] = useState(false);

  return (
    <SettingsSection title="Data">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowReset(true)}
        className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <DatabaseZap className="h-4 w-4" />
        Reset local data
      </Button>
      <ResetLocalDataDialog open={showReset} onOpenChange={setShowReset} />
    </SettingsSection>
  );
}
