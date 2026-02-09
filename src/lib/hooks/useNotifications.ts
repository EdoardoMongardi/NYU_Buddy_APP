'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '@/lib/firebase/client';
import { useAuth } from './useAuth';

/**
 * U16: FCM Push Notifications Hook
 * Handles notification permission, token management, and foreground notifications
 */

// Firebase Cloud Messaging Web Push certificate (VAPID key)
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function useNotifications() {
  const { user } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const onMessageUnsubRef = useRef<(() => void) | null>(null);

  // Set up foreground message listener (reads from data payload for data-only messages)
  const setupForegroundListener = useCallback((messaging: Messaging) => {
    // Clean up existing listener
    if (onMessageUnsubRef.current) {
      onMessageUnsubRef.current();
    }

    onMessageUnsubRef.current = onMessage(messaging, (payload) => {
      console.log('[Notifications] Foreground message received:', payload);

      const data = payload.data || {};
      const title = data.title || payload.notification?.title;
      const body = data.body || payload.notification?.body;

      if (title) {
        new Notification(title, {
          body,
          icon: '/icon.png',
          badge: '/badge.png',
        });
      }
    });
  }, []);

  // Check if notifications are supported and register service worker
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && window.Notification) {
      setIsSupported(true);
      setPermissionStatus(Notification.permission);

      // Register service worker for background notifications
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/firebase-messaging-sw.js')
          .then((registration) => {
            console.log('[Notifications] Service Worker registered:', registration);
          })
          .catch((error) => {
            console.error('[Notifications] Service Worker registration failed:', error);
          });
      }
    } else {
      setIsSupported(false);
    }
  }, []);

  // Re-establish foreground listener AND refresh FCM token for returning users
  useEffect(() => {
    if (!isSupported || !user || !app || !db) return;
    if (Notification.permission !== 'granted') return;

    let cancelled = false;

    const refreshTokenAndListener = async () => {
      try {
        const messaging = getMessaging(app!);
        setupForegroundListener(messaging);
        console.log('[Notifications] Foreground listener re-established for returning user');

        // Re-obtain FCM token — if the old token expired or was rotated,
        // Firebase SDK returns a fresh one. We always update Firestore to
        // keep it in sync.
        if (VAPID_KEY) {
          const swRegistration = await navigator.serviceWorker.ready;
          const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swRegistration,
          });

          if (token && !cancelled) {
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
              fcmToken: token,
              updatedAt: serverTimestamp(),
            }, { merge: true });
            console.log('[Notifications] FCM token refreshed for returning user');
          }
        }
      } catch (err) {
        console.error('[Notifications] Failed to refresh token for returning user:', err);
      }
    };

    refreshTokenAndListener();

    return () => {
      cancelled = true;
      if (onMessageUnsubRef.current) {
        onMessageUnsubRef.current();
        onMessageUnsubRef.current = null;
      }
    };
  }, [isSupported, user, setupForegroundListener]);

  // Request notification permission and register FCM token
  const requestPermission = async (): Promise<{ success: boolean; error?: string }> => {
    if (!isSupported) {
      return { success: false, error: 'Notifications are not supported in this browser' };
    }

    if (!user || !app || !db) {
      return { success: false, error: 'User not authenticated or Firebase not initialized' };
    }

    if (!VAPID_KEY) {
      const error = 'VAPID key not configured. Please add NEXT_PUBLIC_FIREBASE_VAPID_KEY to your .env.local file';
      console.error('[Notifications]', error);
      alert('Configuration Error: VAPID key is missing. Please contact support.');
      return { success: false, error };
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);

      if (permission !== 'granted') {
        return { success: false, error: 'Notification permission denied by user' };
      }

      // Get service worker registration and pass it to getToken for proper token-SW association
      const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (token) {
        console.log('[Notifications] FCM token obtained:', token.substring(0, 20) + '...');

        // Save token to user document
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          fcmToken: token,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        console.log('[Notifications] FCM token saved to Firestore');

        // Set up foreground message listener
        setupForegroundListener(messaging);

        return { success: true };
      } else {
        return { success: false, error: 'Failed to obtain FCM token' };
      }
    } catch (error) {
      console.error('[Notifications] Error requesting permission:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return { success: false, error: errorMessage };
    }
  };

  return {
    isSupported,
    permissionStatus,
    requestPermission,
    hasPermission: permissionStatus === 'granted',
  };
}