"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@powersync/react";
import { useTheme } from "next-themes";
import {
  Bell,
  DatabaseZap,
  Download,
  Undo2,
  LogOut,
  Mail,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { formatRelativeTime } from "@/lib/shared/utils";
import { ResetLocalDataDialog } from "@/components/ResetLocalDataDialog";
import { useToast } from "@/components/toast/ToastProvider";
import { applyUpdate, checkForUpdate } from "@/lib/shared/app-update";
import {
  LAST_IMPORT_BATCH_QUERY,
  toImportBatchSummary,
  undoImportBatch,
  type LastImportBatchRow,
} from "@/lib/notes/import/undo-import";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useDisplayFont } from "@/hooks/use-display-font";
import { DISPLAY_FONTS } from "@/lib/shared/display-font";
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
  /** Opens the Logseq importer. Omitted where no host mounts it. */
  onImportLogseq?: () => void;
}

/** Responsive Settings surface: centered Dialog on desktop, bottom Drawer on mobile. */
export function SettingsDialog({ open, onOpenChange, onImportLogseq }: SettingsDialogProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const body = <SettingsBody open={open} onClose={() => onOpenChange(false)} onImportLogseq={onImportLogseq} />;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Settings</DrawerTitle>
            <DrawerDescription className="sr-only">
              Manage your account, appearance, notifications, and app data.
            </DrawerDescription>
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
          <DialogDescription className="sr-only">
            Manage your account, appearance, notifications, and app data.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto py-1">
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody({
  open,
  onClose,
  onImportLogseq,
}: {
  open: boolean;
  onClose: () => void;
  onImportLogseq?: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AccountSection onClose={onClose} />
      <AppearanceSection />
      <DisplayFontSection />
      <NotificationsSection open={open} />
      <DataSection onClose={onClose} onImportLogseq={onImportLogseq} />
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

// ── Display font ───────────────────────────────────────────────────────────────

function DisplayFontSection() {
  const { font, setFont } = useDisplayFont();

  return (
    <SettingsSection title="Display font">
      <div className="grid grid-cols-4 gap-1.5">
        {DISPLAY_FONTS.map(({ value, label, cssVar }) => {
          const active = font === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFont(value)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-1.5 py-3 transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
              aria-pressed={active}
              title={label}
            >
              <span className="text-2xl leading-none text-foreground" style={{ fontFamily: cssVar }}>
                Aa
              </span>
              <span className="text-center text-[10px] leading-tight">{label}</span>
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

function DataSection({ onClose, onImportLogseq }: { onClose: () => void; onImportLogseq?: () => void }) {
  const [showReset, setShowReset] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const { toast } = useToast();

  // An installed app has no reload gesture, so this is the deliberate way to
  // pull in a deployment. Applying reloads the page, so nothing follows it.
  const checkUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      if (await checkForUpdate()) {
        await applyUpdate();
        return;
      }
      toast({ message: "You're on the latest version." });
    } finally {
      setCheckingUpdate(false);
    }
  };

  // Mounted only while Settings is open, so this doesn't run app-wide.
  const { data: batchRows = [] } = useQuery<LastImportBatchRow>(LAST_IMPORT_BATCH_QUERY);
  const lastImport = toImportBatchSummary(batchRows[0]);

  const undoLastImport = async () => {
    if (!lastImport || undoing) return;
    setUndoing(true);
    try {
      await undoImportBatch(lastImport.batchId);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <SettingsSection title="Data">
      <Button
        variant="ghost"
        size="sm"
        disabled={checkingUpdate}
        onClick={() => void checkUpdate()}
        className="w-full justify-start gap-2"
      >
        {checkingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {checkingUpdate ? "Checking…" : "Check for updates"}
      </Button>
      {onImportLogseq ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Settings gets out of the way — the importer is a full-width,
            // multi-step dialog of its own. It's mounted a level up so closing
            // this one can't unmount it mid-import.
            onClose();
            onImportLogseq();
          }}
          className="w-full justify-start gap-2"
        >
          <Download className="h-4 w-4" />
          Import from Logseq
        </Button>
      ) : null}
      {lastImport ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={undoing}
          onClick={() => void undoLastImport()}
          // `Button` is whitespace-nowrap by default, which a description under
          // the label has to undo or it runs off the edge of the sheet.
          className="h-auto w-full items-start justify-start gap-2 py-2 text-left whitespace-normal"
          title="Moves them to the Trash, where any can be restored"
        >
          {undoing ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <Undo2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span>{undoing ? "Undoing…" : "Undo last import"}</span>
            <span className="text-xs text-muted-foreground">
              {lastImport.pageCount} {lastImport.pageCount === 1 ? "note" : "notes"}
              {lastImport.importedAt ? `, ${formatRelativeTime(new Date(lastImport.importedAt))}` : ""} · moves them to
              the Trash
            </span>
          </span>
        </Button>
      ) : null}
      {/* Set apart, and labelled with what it costs: everything above this line is
          reversible, and this one throws away anything not yet synced. */}
      <div className="mt-2 border-t border-destructive/20 pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowReset(true)}
          className="h-auto w-full items-start justify-start gap-2 py-2 text-left whitespace-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span>Reset local data</span>
            <span className="text-xs font-normal text-muted-foreground">
              Deletes this device&apos;s copy and re-downloads everything. Unsynced changes are lost.
            </span>
          </span>
        </Button>
      </div>
      <ResetLocalDataDialog open={showReset} onOpenChange={setShowReset} onConfirmed={onClose} />
    </SettingsSection>
  );
}
