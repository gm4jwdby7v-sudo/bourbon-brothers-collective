/* global importScripts, firebase, clients */
// Firebase Cloud Messaging background service worker.
// Loads the Firebase compat SDKs and fetches the public web config so we
// don't have to hard-code values in this file.

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const ready = fetch("/api/public/firebase-config")
  .then((r) => r.json())
  .then((cfg) => {
    firebase.initializeApp({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain,
      projectId: cfg.projectId,
      messagingSenderId: cfg.messagingSenderId,
      appId: cfg.appId,
    });
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || "New message";
      const options = {
        body: payload.notification?.body || "",
        icon: "/favicon.ico",
        data: payload.data || {},
      };
      self.registration.showNotification(title, options);
    });
  })
  .catch((e) => console.error("[fcm-sw] init failed", e));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const threadId = event.notification.data?.threadId;
  const target = threadId ? `/messages/${threadId}` : "/messages";
  event.waitUntil(
    (async () => {
      await ready;
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
