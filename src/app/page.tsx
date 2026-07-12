"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { APPS } from "@/lib/shared/apps";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
      <div className="p-3 rounded-xl bg-primary/10 mb-4">
        <LayoutDashboard className="h-8 w-8 text-primary" />
      </div>
      <h1 className="font-heading text-2xl font-semibold tracking-tight mb-1">Dash.</h1>
      <p className="font-serif text-sm text-muted-foreground mb-8">Your offline-first productivity dashboard</p>
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Link
              key={app.id}
              href={app.href}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-border bg-card hover:bg-accent transition-colors"
            >
              <div className={`p-3 rounded-xl ${app.accent.iconBg}`}>
                <Icon className={`h-6 w-6 ${app.accent.iconText}`} />
              </div>
              <span className="font-heading text-sm font-bold tracking-tight">
                {app.name}<span className={app.accent.iconText}>.</span>
              </span>
              <span className="text-xs text-muted-foreground text-center">{app.description}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
