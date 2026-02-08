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

  // Check if notifications are supported
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermissionStatus(Notification.permission);
    }
  }, []);

  // Request notification permission and register FCM token
  const requestPermission = async (): Promise<boolean> => {
    if (!isSupported || !user || !app || !db) {
      console.log('[Notifications] Not supported or user not authenticated');
      return false;
    }

    if (!VAPID_KEY) {
      console.error('[Notifications] VAPID key not configured');
      return false;
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);

      if (permission !== 'granted') {
        console.log('[Notifications] Permission denied by user');
        return false;
      }

      // Get FCM token
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
      });

      if (token) {
        console.log('[Notifications] FCM token obtained:', token.substring(0, 20) + '...');

        // Save token to user document
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          fcmToken: token,
          updatedAt: serverTimestamp(),
        });

        console.log('[Notifications] FCM token saved to Firestore');

        // Listen for foreground messages
        onMessage(messaging, (payload) => {
          console.log('[Notifications] Foreground message received:', payload);

          // Show browser notification if app is in foreground
          if (payload.notification) {
            new Notification(payload.notification.title || 'NYU Buddy', {
              body: payload.notification.body,
              icon: '/icon.png', // Ensure you have an icon in public folder
            });
          }
        });

        return true;
      } else {
        console.error('[Notifications] Failed to get FCM token');
        return false;
      }
    } catch (error) {
      console.error('[Notifications] Error requesting permission:', error);
      return false;
    }
  };

  return {
    isSupported,
    permissionStatus,
    requestPermission,
    hasPermission: permissionStatus === 'granted',
  };
}