import { ArrowLeft, ChevronDown, ChevronUp, Copy, Ellipsis, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type TimestampInfo = { relative: string; absolute: string } | null;

type NotesEditorChromeBarProps = {
  showTimestamp: boolean;
  showAbsoluteTime: boolean;
  timestamp: TimestampInfo;
  isFavorite: boolean;
  showAppHeader: boolean;
  onBack: () => void;
  onToggleTimestamp: () => void;
  onToggleAppHeader: () => void;
  onToggleFavorite: () => void;
  onCopyDocument: () => void;
  onDelete: () => void;
};

const iconButtonClass = "size-8 rounded-full text-muted-foreground transition-[color,background-color,box-shadow] duration-200 hover:bg-accent/60 hover:text-foreground hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.5)] md:size-9";
const textButtonClass = "inline-flex h-8 w-fit items-center justify-self-start px-0 text-[11px] text-muted-foreground/80 transition-colors duration-200 hover:text-foreground";

export function NotesEditorChromeBar({
  showTimestamp,
  showAbsoluteTime,
  timestamp,
  isFavorite,
  showAppHeader,
  onBack,
  onToggleTimestamp,
  onToggleAppHeader,
  onToggleFavorite,
  onCopyDocument,
  onDelete,
}: NotesEditorChromeBarProps) {
  return (
    <div className="hidden h-9 items-center sm:flex">
      <div className="mx-auto grid w-full max-w-3xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 md:gap-x-2">
        <Button
          variant="ghost"
          onClick={onBack}
          className={`-ml-2 -mr-1 flex shrink-0 items-center justify-center ${iconButtonClass}`}
          aria-label="Back to notes list"
        >
          <ArrowLeft className="h-6 w-6 md:h-7 md:w-7" />
        </Button>
        {showTimestamp ? (
          <button
            type="button"
            onClick={onToggleTimestamp}
            key={timestamp?.absolute}
            className={`${textButtonClass} animate-fade-slide-in-soft`}
          >
            {showAbsoluteTime ? timestamp?.absolute : `Edited ${timestamp?.relative}`}
          </button>
        ) : <span className="block h-4 w-32" aria-hidden="true" />}
        <div className="flex items-center justify-self-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleAppHeader}
            className={iconButtonClass}
            aria-label={showAppHeader ? "Hide app header" : "Show app header"}
          >
            {showAppHeader ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleFavorite}
            className={`${iconButtonClass} ${isFavorite ? "text-amber-500 hover:text-amber-500" : ""}`}
            aria-label="Toggle favorite"
          >
            <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className={`inline-flex items-center justify-center ${iconButtonClass}`} aria-label="Page actions">
              <Ellipsis className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onCopyDocument}>
                <Copy className="h-4 w-4" />
                Copy document
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  // Blur the menu trigger before opening the dialog to avoid
                  // aria-hidden conflict (dialog hides ancestor while trigger has focus).
                  (document.activeElement as HTMLElement)?.blur?.();
                  onDelete();
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
