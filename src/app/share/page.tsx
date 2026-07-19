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
    <div className="min-h-full bg-background px-[var(--app-gutter-x)] py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Share2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Capture</h1>
            <p className="text-sm text-muted-foreground">
              Save the shared content to the right place. Pick a destination — we&apos;ve guessed one for you.
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <CaptureTriage key={searchKey} payload={payload} mode="page" />
        </section>
      </div>
    </div>
  );
}
