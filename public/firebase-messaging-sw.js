/**
 * U16: Firebase Cloud Messaging Service Worker
 * Handles background push notifications when the app is not in focus
 */

// Import Firebase scripts for service worker
// IMPORTANT: Keep this version in sync with package.json firebase dependency (currently v12.8.0)
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js');

// Firebase configuration (must match your Firebase project)
// Note: These values are safe to expose in client-side code
const firebaseConfig = {
  apiKey: "AIzaSyDJICNPp5y63u5i6bT5fj9Ai7mfE7HNbZo",
  authDomain: "nyu-buddy.firebaseapp.com",
  projectId: "nyu-buddy",
  storageBucket: "nyu-buddy.firebasestorage.app",
  messagingSenderId: "702302026926",
  appId: "1:702302026926:web:56a05d69dcb6c5b8b94426",
  measurementId: "G-97MZ0MPKRP"
};

// Initialize Firebase in service worker
firebase.initializeApp(firebaseConfig);

// Get Firebase Messaging instance
const messaging = firebase.messaging();

// Handle background messages (data-only messages — title/body are in payload.data)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Background message received:', payload);

  const data = payload.data || {};
  const notificationTitle = data.title || 'NYU Buddy';
  const notificationOptions = {
    body: data.body || 'You have a new notification',
    icon: '/icon.png',
    badge: '/badge.png',
    data: data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw] Notification clicked:', event);

  event.notification.close();

  // Navigate to relevant page based on notification type
  const urlToOpen = new URL('/', self.location.origin).href;

  const promiseChain = clients
    .matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    .then((windowClients) => {
      // Check if there's already a window open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if no matching window found
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    });

  event.waitUntil(promiseChain);
});