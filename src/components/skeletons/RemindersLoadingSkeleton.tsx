"use client";

import { AppHeader } from "@/components/AppHeader";
import { getApp } from "@/lib/shared/apps";

const remindersApp = getApp("reminders");

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function ReminderCardBone() {
  return (
    <div className="mb-5 break-inside-avoid rounded-2xl border border-border/65 bg-card/60 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Bone className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2.5 pr-16">
          <Bone className="h-5 w-3/5" />
          <Bone className="h-3.5 w-40" />
          <Bone className="h-3 w-28" />
          <div className="flex gap-1.5 pt-1">
            <Bone className="h-5 w-14 rounded-full" />
            <Bone className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-page reminders skeleton. Shared by the route `loading.tsx` (navigation
 * fallback) and the cold-start boot skeleton so both look identical. Mirrors
 * the /reminders page: sticky header, an intro line, then a card list.
 */
export function RemindersLoadingSkeleton() {
  return (
    <>
      <AppHeader app={remindersApp} />
      <div className="mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-6 sm:py-10">
          <Bone className="h-11 w-11 rounded-xl" />
          <Bone className="h-6 w-2/5" />
          <Bone className="h-4 w-64" />
        </div>

        <div className="mt-8 mb-6 flex items-baseline gap-3 sm:mt-12">
          <Bone className="h-3 w-24" />
          <div className="h-px flex-1 bg-border/40" />
        </div>

        <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
          <ReminderCardBone />
          <ReminderCardBone />
          <ReminderCardBone />
          <ReminderCardBone />
          <ReminderCardBone />
          <ReminderCardBone />
        </div>
      </div>
    </>
  );
}
