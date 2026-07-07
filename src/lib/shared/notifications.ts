import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/shared/auth";
import { logger } from "@/lib/shared/logger";

/**
 * Web Push subscription utility.
 *
 * Pure (non-React) helpers for opting into / out of browser push notifications and
 * reading the current state. A future settings page wires these to a toggle; nothing
 * calls them yet.
 *
 * The push_subscriptions row is written directly through the Supabase browser client
 * (not PowerSync) — it is device/auth state, not synced local-first content. RLS
 * (`auth.uid() = user_id`) passes because the browser client carries the user's JWT.
 */

export type PushState = "unsupported" | "denied" | "unsubscribed" | "subscribed";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** True when this browser can register a push subscription. */
function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Decode a base64url VAPID public key into the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  // Back the view with a concrete ArrayBuffer so it satisfies BufferSource
  // (applicationServerKey rejects the SharedArrayBuffer-inclusive ArrayBufferLike).
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Shape of the credentials a PushSubscription exposes via toJSON(). */
interface SerializedSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function serialize(subscription: PushSubscription): SerializedSubscription {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Push subscription is missing endpoint or keys");
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Report whether push is supported, permitted, and currently subscribed. */
export async function getPushSubscriptionState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "subscribed" : "unsubscribed";
}

/**
 * Request permission, subscribe via the service worker, and persist the credentials.
 * Returns the PushSubscription on success, or null if unsupported/denied/failed.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    logger.warn("Push not supported in this browser");
    return null;
  }
  if (!VAPID_PUBLIC_KEY) {
    logger.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      logger.warn("Push permission not granted:", permission);
      return null;
    }

    const registration = await navigator.serviceWorker.ready;

    // Reuse an existing subscription if one is already registered.
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));

    const { endpoint, keys } = serialize(subscription);
    const userId = await getCurrentUserId();
    if (!userId) {
      logger.error("Cannot persist push subscription: no authenticated user");
      return null;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        { onConflict: "endpoint" }
      );

    if (error) {
      logger.error("Failed to save push subscription:", error.message);
      return null;
    }

    logger.info("Push subscription saved");
    return subscription;
  } catch (err) {
    logger.error("subscribeToPush failed:", err);
    return null;
  }
}

/** Unsubscribe locally and delete the persisted credentials. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const { endpoint } = serialize(subscription);
    await subscription.unsubscribe();

    const supabase = createClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);

    if (error) {
      logger.error("Failed to delete push subscription:", error.message);
      return;
    }

    logger.info("Push subscription removed");
  } catch (err) {
    logger.error("unsubscribeFromPush failed:", err);
  }
}
