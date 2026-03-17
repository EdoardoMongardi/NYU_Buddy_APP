import { NextResponse } from 'next/server';

// This route serves the Firebase messaging service worker with
// environment variables injected at request time, so no secrets
// need to be hardcoded in the public/ directory.
export async function GET() {
    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
    };

    const swContent = `
/**
 * Firebase Cloud Messaging Service Worker
 * Handles background push notifications when the app is not in focus.
 * This file is generated dynamically — do not edit public/firebase-messaging-sw.js directly.
 */

importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js');

const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages (data-only messages — title/body are in payload.data)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Background message received:', payload);

  const data = payload.data || {};
  const notificationTitle = data.title || 'NYU Buddy';
  const notificationOptions = {
    body: data.body || 'You have a new notification',
    icon: '/app-icon-192x192.png',
    badge: '/app-icon-192x192.png',
    data: data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw] Notification clicked:', event);

  event.notification.close();

  const urlToOpen = new URL('/', self.location.origin).href;

  const promiseChain = clients
    .matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    .then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    });

  event.waitUntil(promiseChain);
});
`.trim();

    return new NextResponse(swContent, {
        status: 200,
        headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            // Service workers must be served from correct scope; no caching so env changes take effect
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Service-Worker-Allowed': '/',
        },
    });
}
