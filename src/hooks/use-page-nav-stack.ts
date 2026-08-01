"use client";

import { useCallback, useSyncExternalStore } from "react";

import { pushEntry, popEntry, popToEntry, type PageNavEntry } from "@/lib/notes/page-nav-stack";
export type { PageNavEntry } from "@/lib/notes/page-nav-stack";

const STORAGE_KEY = "notes-nav-stack";

let stack: PageNavEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function loadFromSession() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) stack = JSON.parse(raw);
  } catch { /* ignore */ }
}

function persistToSession() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
  } catch { /* ignore */ }
}

loadFromSession();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return stack;
}

function getServerSnapshot(): PageNavEntry[] {
  return [];
}

export function usePageNavStack() {
  const currentStack = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const push = useCallback((entry: PageNavEntry) => {
    const next = pushEntry(stack, entry);
    if (next === stack) return;
    stack = next;
    persistToSession();
    emit();
  }, []);

  const pop = useCallback((): PageNavEntry | undefined => {
    const result = popEntry(stack);
    if (result.stack === stack) return undefined;
    stack = result.stack;
    persistToSession();
    emit();
    return result.popped;
  }, []);

  const popTo = useCallback((pageId: string): PageNavEntry | undefined => {
    const result = popToEntry(stack, pageId);
    if (result.stack === stack) return undefined;
    stack = result.stack;
    persistToSession();
    emit();
    return result.target;
  }, []);

  const clear = useCallback(() => {
    stack = [];
    persistToSession();
    emit();
  }, []);

  return { stack: currentStack, push, pop, popTo, clear };
}
