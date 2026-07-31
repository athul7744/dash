import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * True only after the component has mounted on the client, false during SSR and
 * the first hydration render — SSR-safe and without a set-state-in-effect. Use
 * to gate client-only work such as `createPortal(..., document.body)`.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
