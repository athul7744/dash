"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Share2 } from "lucide-react";

import { CaptureTriage } from "@/components/capture/CaptureTriage";
import { readIncomingSharePayload } from "@/lib/shared/share";

export default function SharePage() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const payload = useMemo(() => readIncomingSharePayload(searchParams), [searchParams]);

  return (
    <div className="min-h-full bg-background px-[var(--app-gutter-x)] py-10 sm:py-14">
      <div className="mx-auto flex max-w-xl flex-col gap-7">
        <header className="flex items-baseline gap-2.5">
          <Share2 className="h-4 w-4 shrink-0 translate-y-0.5 text-muted-foreground" />
          <div className="space-y-1">
            <h1 className="font-serif text-2xl leading-tight text-foreground">Capture</h1>
            <p className="text-sm text-muted-foreground">
              We&apos;ve guessed where this belongs — change it if you like.
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-border/60 bg-card/50 p-5 sm:p-6">
          <CaptureTriage key={searchKey} payload={payload} mode="page" />
        </section>
      </div>
    </div>
  );
}
