// Browser-side Firebase Cloud Messaging helpers.
// Initializes the FCM SDK lazily, requests notification permission,
// retrieves an FCM token, and persists it to our database so the server
// can deliver push notifications to this device.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
} from "firebase/messaging";

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

let configPromise: Promise<FirebaseWebConfig> | null = null;
let appPromise: Promise<FirebaseApp | null> | null = null;
let messagingPromise: Promise<Messaging | null> | null = null;

async function loadConfig(): Promise<FirebaseWebConfig> {
  if (!configPromise) {
    configPromise = fetch("/api/public/firebase-config")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load Firebase config");
        return r.json() as Promise<FirebaseWebConfig>;
      })
      .catch((e) => {
        configPromise = null;
        throw e;
      });
  }
  return configPromise;
}

async function getApp(): Promise<FirebaseApp | null> {
  if (!appPromise) {
    appPromise = (async () => {
      const cfg = await loadConfig();
      return getApps().length ? getApps()[0]! : initializeApp(cfg);
    })();
  }
  return appPromise;
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (typeof window === "undefined") return null;
      if (!(await isSupported().catch(() => false))) return null;
      const app = await getApp();
      if (!app) return null;
      return getMessaging(app);
    })();
  }
  return messagingPromise;
}

export type PushStatus = "unsupported" | "granted" | "denied" | "default";

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  if (!(await isSupported().catch(() => false))) return "unsupported";
  return Notification.permission as PushStatus;
}

/**
 * Requests notification permission, retrieves the FCM token, and returns it.
 * Returns null if unsupported or the user declined. Caller persists the token.
 */
export async function enablePushNotifications(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window)) return null;

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const cfg = await loadConfig();

  // Register the dedicated messaging SW (kept separate from any app SW).
  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
    { scope: "/firebase-cloud-messaging-push-scope" },
  );

  const token = await getToken(messaging, {
    vapidKey: cfg.vapidKey,
    serviceWorkerRegistration: registration,
  });
  return token || null;
}

/** Subscribe to foreground FCM messages. Returns an unsubscribe fn. */
export async function onForegroundPush(
  handler: (payload: {
    title?: string;
    body?: string;
    data?: Record<string, string>;
  }) => void,
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  const unsub = onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: payload.data as Record<string, string> | undefined,
    });
  });
  return unsub;
}
