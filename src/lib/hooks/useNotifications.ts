'use client';

import { useEffect, useState } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '@/lib/firebase/client';
import { useAuth } from './useAuth';

/**
 * U16: FCM Push Notifications Hook
 * Handles notification permission, token management, and foreground notifications
 */

// Firebase Cloud Messaging Web Push certificate (VAPID key)
// This should be generated in Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function useNotifications() {
  const { user } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  // Check if notifications are supported and register service worker
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
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
    }
  }, []);

  // Request notification permission and register FCM token
  const requestPermission = async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[Notifications] Starting permission request...');
    console.log('[Notifications] isSupported:', isSupported);
    console.log('[Notifications] user:', !!user);
    console.log('[Notifications] app:', !!app);
    console.log('[Notifications] db:', !!db);
    console.log('[Notifications] VAPID_KEY:', !!VAPID_KEY);

    if (!isSupported) {
      const error = 'Notifications are not supported in this browser';
      console.error('[Notifications]', error);
      return { success: false, error };
    }

    if (!user || !app || !db) {
      const error = 'User not authenticated or Firebase not initialized';
      console.error('[Notifications]', error);
      return { success: false, error };
    }

    if (!VAPID_KEY) {
      const error = 'VAPID key not configured. Please add NEXT_PUBLIC_FIREBASE_VAPID_KEY to your .env.local file';
      console.error('[Notifications]', error);
      alert('Configuration Error: VAPID key is missing. Please contact support.');
      return { success: false, error };
    }

    try {
      console.log('[Notifications] Requesting notification permission...');

      // Request notification permission
      const permission = await Notification.requestPermission();
      console.log('[Notifications] Permission result:', permission);
      setPermissionStatus(permission);

      if (permission !== 'granted') {
        const error = 'Notification permission denied by user';
        console.log('[Notifications]', error);
        return { success: false, error };
      }

      console.log('[Notifications] Getting FCM messaging instance...');
      // Get FCM token
      const messaging = getMessaging(app);

      console.log('[Notifications] Requesting FCM token...');
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
      });

      if (token) {
        console.log('[Notifications] FCM token obtained:', token.substring(0, 20) + '...');

        // Save token to user document
        const userRef = doc(db, 'users', user.uid);
        console.log('[Notifications] Saving token to Firestore...');

        await updateDoc(userRef, {
          fcmToken: token,
          updatedAt: serverTimestamp(),
        });

        console.log('[Notifications] ✅ FCM token saved to Firestore successfully!');

        // Listen for foreground messages
        onMessage(messaging, (payload) => {
          console.log('[Notifications] Foreground message received:', payload);

          // Show browser notification if app is in foreground
          if (payload.notification) {
            new Notification(payload.notification.title || 'NYU Buddy', {
              body: payload.notification.body,
              icon: '/icon.png',
              badge: '/badge.png',
            });
          }
        });

        return { success: true };
      } else {
        const error = 'Failed to obtain FCM token';
        console.error('[Notifications]', error);
        return { success: false, error };
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