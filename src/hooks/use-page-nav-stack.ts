"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

export interface PageNavEntry {
  pageId: string;
  title: string;
}

const STORAGE_KEY = "notes-nav-stack";
const MAX_STACK_DEPTH = 20;

let stack: PageNavEntry[] = [];
let listeners = new Set<() => void>();

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
    // Don't push duplicates of the same page at the top
    if (stack.length > 0 && stack[stack.length - 1].pageId === entry.pageId) return;
    stack = [...stack, entry].slice(-MAX_STACK_DEPTH);
    persistToSession();
    emit();
  }, []);

  const pop = useCallback((): PageNavEntry | undefined => {
    if (stack.length === 0) return undefined;
    const popped = stack[stack.length - 1];
    stack = stack.slice(0, -1);
    persistToSession();
    emit();
    return popped;
  }, []);

  const popTo = useCallback((pageId: string): PageNavEntry | undefined => {
    const idx = stack.findIndex((e) => e.pageId === pageId);
    if (idx === -1) return undefined;
    const target = stack[idx];
    stack = stack.slice(0, idx);
    persistToSession();
    emit();
    return target;
  }, []);

  const clear = useCallback(() => {
    stack = [];
    persistToSession();
    emit();
  }, []);

  return { stack: currentStack, push, pop, popTo, clear };
}
