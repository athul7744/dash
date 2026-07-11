"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { getLinkHost } from "@/lib/tasks/tasks";

interface FaviconProps {
  url: string;
  className?: string;
}

/**
 * Renders a site's favicon, walking a provider fallback chain — DuckDuckGo, then
 * the site's own /favicon.ico, then Google — before falling back to a Globe icon.
 * Presentational only (no anchor), so it can live inside buttons/triggers.
 */
export function Favicon({ url, className }: FaviconProps) {
  const host = getLinkHost(url);

  const candidates = React.useMemo(
    () =>
      host
        ? [
            `https://icons.duckduckgo.com/ip3/${host}.ico`,
            `https://${host}/favicon.ico`,
            `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
          ]
        : [],
    [host]
  );

  // Track the host alongside the index so a URL change resets the provider chain
  // during render (no effect / cascading render needed).
  const [state, setState] = React.useState({ host, index: 0 });
  if (state.host !== host) setState({ host, index: 0 });

  if (!host || state.index >= candidates.length) {
    return <Globe className={cn("h-3.5 w-3.5", className)} />;
  }

  return (
    <img
      src={candidates[state.index]}
      alt=""
      className={cn("h-3.5 w-3.5 rounded-sm", className)}
      onError={() => setState((s) => ({ host: s.host, index: s.index + 1 }))}
    />
  );
}
