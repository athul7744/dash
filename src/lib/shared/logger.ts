const PREFIX = '[PowerSync]';
const isDev = process.env.NODE_ENV !== 'production';
const LOG_LIMIT = 50;
const logViewerEnabled = process.env.NEXT_PUBLIC_ENABLE_LOG_VIEW === 'true';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: string;
}

let nextLogId = 1;
const recentLogs: LogEntry[] = [];
/**
 * `recentLogs` newest-first, rebuilt on each write.
 *
 * Held rather than derived on demand because the log viewer subscribes to this
 * store with `useSyncExternalStore`, which compares snapshots by identity: a
 * fresh array per read would look like a change on every render.
 */
let snapshot: LogEntry[] = [];
const listeners = new Set<() => void>();

function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }

  if (typeof arg === 'string') {
    return arg;
  }

  if (typeof arg === 'undefined') {
    return 'undefined';
  }

  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function recordLog(level: LogLevel, args: unknown[]) {
  if (!logViewerEnabled) return;

  recentLogs.push({
    id: nextLogId++,
    level,
    message: args.map(formatArg).join(' '),
    timestamp: new Date().toISOString(),
  });

  if (recentLogs.length > LOG_LIMIT) {
    recentLogs.splice(0, recentLogs.length - LOG_LIMIT);
  }

  snapshot = [...recentLogs].reverse();
  listeners.forEach((listener) => listener());
}

export function isLogViewerEnabled() {
  return logViewerEnabled;
}

export function getRecentLogs(): readonly LogEntry[] {
  return snapshot;
}

export function subscribeToLogs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const logger = {
  info: (...args: unknown[]) => {
    recordLog('info', args);
    if (isDev) console.log(PREFIX, ...args);
  },
  warn: (...args: unknown[]) => {
    recordLog('warn', args);
    if (isDev) console.warn(PREFIX, ...args);
  },
  error: (...args: unknown[]) => {
    recordLog('error', args);
    console.error(PREFIX, ...args);
  },
};