"use client";

import { useState } from "react";
import { BellRing, Plus } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { CollectionHeading } from "@/components/CollectionHeading";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { ReminderCard } from "@/components/reminders/ReminderCard";
import { RemindersLoadingSkeleton } from "@/components/skeletons/RemindersLoadingSkeleton";
import { useReminderMaterializer, useReminders } from "@/hooks/use-reminders";
import { useNewItemParam } from "@/hooks/use-new-item-param";
import { createReminder } from "@/lib/reminders/reminders";
import { getApp, HEADER_ACTION_BASE } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

const remindersApp = getApp("reminders");

export default function RemindersPage() {
  const { reminders, isLoading } = useReminders();
  // Materialize any due reminders when this screen opens, too.
  useReminderMaterializer();

  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const addReminder = async () => {
    const id = await createReminder();
    setJustCreatedId(id);
  };

  // Command-palette "New reminder" (?new=1) adds a fresh reminder on arrival.
  useNewItemParam(addReminder, !isLoading);

  if (isLoading) return <RemindersLoadingSkeleton />;

  return (
    <>
      <AppHeader
        app={remindersApp}
        actions={
          <button
            type="button"
            onClick={addReminder}
            className={cn(HEADER_ACTION_BASE, remindersApp.accent.hoverText)}
          >
            <Plus className="h-4 w-4" />
            New reminder
          </button>
        }
      />

      <div className="mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        {reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="rounded-2xl bg-violet-500/10 p-3 dark:bg-violet-500/20">
              <BellRing className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="space-y-1">
              <p className="font-serif text-lg text-foreground">No reminders yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Set a recurring task and a lead time. Dash adds it to your tasks automatically before
                it&apos;s due.
              </p>
            </div>
            <button
              type="button"
              onClick={addReminder}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-violet-500"
            >
              <Plus className="h-4 w-4" />
              New reminder
            </button>
          </div>
        ) : (
          <>
            <div className="mx-auto max-w-2xl py-2 text-center sm:py-6">
              <p className="text-sm text-muted-foreground">
                Recurring tasks add themselves. A task lands in{" "}
                <span className="text-foreground">Tasks</span> a set number of days before each
                occurrence — with the title, link, tags, and priority you set here.
              </p>
            </div>

            {/* Section break: the collection reads as a distinct zone. */}
            <CollectionHeading label="All reminders" count={reminders.length} className="mt-8 mb-6 sm:mt-12" />

            <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
              {reminders.map((reminder) => (
                <div key={reminder.id} className="mb-5 break-inside-avoid">
                  <ReminderCard reminder={reminder} autoFocus={reminder.id === justCreatedId} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <MobileBottomFabs
        app={remindersApp}
        centerContent={
          <button
            type="button"
            onClick={addReminder}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
          >
            <Plus className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            New reminder
          </button>
        }
      />
    </>
  );
}
