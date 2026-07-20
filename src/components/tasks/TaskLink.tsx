"use client";

import * as React from "react";
import { Link2, ExternalLink, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import { getLinkHost, normalizeUrl } from "@/lib/tasks/tasks";
import { Favicon } from "@/components/tasks/Favicon";

interface TaskLinkProps {
  link: string;
  onLinkChange: (value: string) => void;
}

/**
 * Combined favicon + domain chip that opens an inline editor popover. When a link
 * is set the chip shows the favicon and domain; clicking it opens an editor with
 * an open-in-browser button (left), the editable URL (center), and a remove button
 * (right). With no link set, a subtle "add link" button is revealed on card hover.
 */
export function TaskLink({ link, onLinkChange }: TaskLinkProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const host = getLinkHost(link);
  const domain = host?.replace(/^www\./, "");

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        title={host ? link : "Add link"}
        className={cn(
          "flex h-6 items-center rounded-md shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          host
            ? "justify-center gap-1 px-1 max-w-[9rem] text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            : "w-6 justify-center text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        )}
      >
        {host ? (
          <>
            <Favicon url={link} className="shrink-0" />
            <span className="hidden truncate sm:inline">{domain}</span>
          </>
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1.5" align="end">
        <div className="flex items-center gap-1">
          {host && (
            <a
              href={normalizeUrl(link)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in browser"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <Input
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            value={link}
            onChange={(e) => onLinkChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setIsOpen(false);
              }
            }}
            autoFocus
            className="h-8 flex-1 text-sm"
          />
          {host && (
            <button
              type="button"
              title="Remove link"
              onClick={() => { onLinkChange(""); setIsOpen(false); }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
