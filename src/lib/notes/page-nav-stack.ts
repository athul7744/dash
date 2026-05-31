export interface PageNavEntry {
  pageId: string;
  title: string;
}

const MAX_STACK_DEPTH = 20;

export function pushEntry(stack: PageNavEntry[], entry: PageNavEntry): PageNavEntry[] {
  // Don't push duplicates of the same page at the top
  if (stack.length > 0 && stack[stack.length - 1].pageId === entry.pageId) return stack;
  return [...stack, entry].slice(-MAX_STACK_DEPTH);
}

export function popEntry(stack: PageNavEntry[]): { stack: PageNavEntry[]; popped: PageNavEntry | undefined } {
  if (stack.length === 0) return { stack, popped: undefined };
  return { stack: stack.slice(0, -1), popped: stack[stack.length - 1] };
}

export function popToEntry(stack: PageNavEntry[], pageId: string): { stack: PageNavEntry[]; target: PageNavEntry | undefined } {
  const idx = stack.findLastIndex((e) => e.pageId === pageId);
  if (idx === -1) return { stack, target: undefined };
  return { stack: stack.slice(0, idx), target: stack[idx] };
}
