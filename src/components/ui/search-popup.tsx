"use client"

import * as React from "react"

import { Command, CommandDialog, CommandInput, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/shared/utils"

const SEARCH_POPUP_CLOSE_ANIMATION_MS = 130

type AnchorRect = {
  left: number
  top: number
  width: number
}

type SearchPopupProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  placeholder?: string
  query: string
  onQueryChange: (value: string) => void
  children: React.ReactNode
  className?: string
  listClassName?: string
  style?: React.CSSProperties
  anchorRef?: React.RefObject<HTMLElement | null>
  overlayClassName?: string
  disableDefaultAnimation?: boolean
  closeAnimationMs?: number
  /** Ref to the underlying text input (for caret control). */
  inputRef?: React.Ref<HTMLInputElement>
  /** Key handler on the input (e.g. custom backspace for filter chips). */
  onInputKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  /** Node rendered inside the input row, before the text (e.g. a filter chip). */
  inputPrefix?: React.ReactNode
}

function SearchPopup({
  open,
  onOpenChange,
  title,
  description,
  placeholder = "Search...",
  query,
  onQueryChange,
  children,
  className,
  listClassName,
  style,
  anchorRef,
  overlayClassName,
  disableDefaultAnimation,
  closeAnimationMs = SEARCH_POPUP_CLOSE_ANIMATION_MS,
  inputRef,
  onInputKeyDown,
  inputPrefix,
}: SearchPopupProps) {
  const [anchorRect, setAnchorRect] = React.useState<AnchorRect | null>(null)

  React.useLayoutEffect(() => {
    if (!open || !anchorRef?.current) {
      return
    }

    const updateAnchorRect = () => {
      const trigger = anchorRef.current
      if (!trigger) {
        setAnchorRect(null)
        return
      }

      const rect = trigger.getBoundingClientRect()
      setAnchorRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
      })
    }

    updateAnchorRect()
    window.addEventListener("resize", updateAnchorRect)
    window.addEventListener("scroll", updateAnchorRect, true)

    const trigger = anchorRef.current
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          updateAnchorRect()
        })

    if (trigger && resizeObserver) {
      resizeObserver.observe(trigger)
    }

    return () => {
      window.removeEventListener("resize", updateAnchorRect)
      window.removeEventListener("scroll", updateAnchorRect, true)
      resizeObserver?.disconnect()
    }
  }, [anchorRef, open])

  React.useEffect(() => {
    if (open || !anchorRect) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setAnchorRect(null)
    }, closeAnimationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [anchorRect, closeAnimationMs, open])

  const isAnchored = anchorRect !== null

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      showCloseButton={false}
      className={cn(
        "top-[12dvh] max-w-[min(44rem,calc(100%-1.5rem))] translate-y-0 overflow-hidden rounded-2xl border border-border/60 bg-popover/96 p-0 shadow-[0_24px_100px_-38px_rgba(0,0,0,0.55)] supports-backdrop-filter:backdrop-blur-xl",
        isAnchored ? "notes-search-popup-anchor left-0 top-0 max-w-none -translate-x-0 -translate-y-0 sm:max-w-none" : null,
        className,
      )}
      style={isAnchored
        ? {
            ...style,
            left: `${anchorRect.left}px`,
            top: `${anchorRect.top}px`,
            width: `${anchorRect.width}px`,
          }
        : style
      }
      overlayClassName={overlayClassName}
      disableDefaultAnimation={disableDefaultAnimation || isAnchored}
    >
      <Command shouldFilter={false} className="rounded-none! bg-transparent p-0">
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={onQueryChange}
          onKeyDown={onInputKeyDown}
          leadingSlot={inputPrefix}
          placeholder={placeholder}
          className="h-10 text-[15px]"
        />
        <CommandList className={cn("max-h-[min(56dvh,28rem)] px-1 pb-1", listClassName)}>
          {children}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

export { SEARCH_POPUP_CLOSE_ANIMATION_MS, SearchPopup }