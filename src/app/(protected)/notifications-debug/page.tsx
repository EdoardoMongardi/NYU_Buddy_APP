'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

/**
 * U16 Debug Page: Notification Configuration Checker
 * Helps diagnose notification setup issues
 */

export default function NotificationsDebugPage() {
  const { user } = useAuth();
  const { isSupported, permissionStatus, requestPermission } = useNotifications();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Capture debug info
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const info = `
User Agent: ${navigator.userAgent}
Notification in window: ${'Notification' in window}
window.Notification: ${!!window.Notification}
Notification.permission: ${window.Notification ? Notification.permission : 'N/A'}
ServiceWorker available: ${'serviceWorker' in navigator}
      `.trim();
      setDebugInfo(info);
    }
  }, []);

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

  // Fetch FCM token from Firestore
  const fetchFcmToken = useCallback(async () => {
    if (!user || !db) return;

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const token = userDoc.data()?.fcmToken;
        setFcmToken(token || null);
      }
    } catch (error) {
      console.error('Error fetching FCM token:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchFcmToken();
  }, [fetchFcmToken]);

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    setTestResult(null);

    const result = await requestPermission();

    if (result.success) {
      setTestResult('✅ Notifications enabled successfully!');
      // Refresh token display
      setTimeout(fetchFcmToken, 1000);
    } else {
      setTestResult(`❌ Failed: ${result.error}`);
    }

    setIsLoading(false);
  };

  const handleTestNotification = () => {
    if (permissionStatus !== 'granted') {
      setTestResult('❌ Permission not granted. Enable notifications first.');
      return;
    }

    try {
      // Test browser notification (bypasses FCM to test locally)
      new Notification('Test Notification from NYU Buddy 🎉', {
        body: 'If you see this, browser notifications are working!',
        icon: '/icon.png',
        badge: '/badge.png',
      });
      setTestResult('✅ Test notification sent! Check if it appeared.');
    } catch (error) {
      setTestResult(`❌ Failed to send test notification: ${error}`);
    }
  };

  const StatusItem = ({ label, value, status }: { label: string; value: string; status: 'success' | 'error' | 'warning' }) => {
    const Icon = status === 'success' ? CheckCircle : status === 'error' ? XCircle : AlertCircle;
    const color = status === 'success' ? 'text-green-600' : status === 'error' ? 'text-red-600' : 'text-yellow-600';

    return (
      <div className="flex items-start justify-between py-3 border-b border-gray-200 last:border-0">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className={`text-sm ${color} font-mono`}>{value}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">Notifications Debug</h1>
      <p className="text-gray-600 mb-6">
        Use this page to diagnose notification configuration issues
      </p>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Configuration Status</h2>

        <div className="space-y-1">
          <StatusItem
            label="Browser Support"
            value={isSupported ? 'Supported' : 'Not Supported'}
            status={isSupported ? 'success' : 'error'}
          />

          <StatusItem
            label="Permission Status"
            value={permissionStatus}
            status={
              permissionStatus === 'granted'
                ? 'success'
                : permissionStatus === 'denied'
                ? 'error'
                : 'warning'
            }
          />

          <StatusItem
            label="VAPID Key Configured"
            value={vapidKey ? 'Yes' : 'No'}
            status={vapidKey ? 'success' : 'error'}
          />

          {vapidKey && (
            <StatusItem
              label="VAPID Key (First 20 chars)"
              value={vapidKey.substring(0, 20) + '...'}
              status="success"
            />
          )}

          <StatusItem
            label="Service Worker"
            value={typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Available' : 'Not Available'}
            status={typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'success' : 'error'}
          />

          <StatusItem
            label="User Authenticated"
            value={user ? 'Yes' : 'No'}
            status={user ? 'success' : 'error'}
          />

          <StatusItem
            label="FCM Token in Firestore"
            value={fcmToken ? 'Stored' : 'Not Stored'}
            status={fcmToken ? 'success' : 'warning'}
          />

          {fcmToken && (
            <div className="py-3 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-700 block mb-2">FCM Token</span>
              <code className="text-xs bg-gray-100 p-2 rounded block break-all">
                {fcmToken}
              </code>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Actions</h2>

        <div className="space-y-4">
          <div>
            <Button
              onClick={handleEnableNotifications}
              disabled={isLoading || permissionStatus === 'granted'}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Requesting Permission...
                </>
              ) : permissionStatus === 'granted' ? (
                'Notifications Already Enabled'
              ) : (
                'Enable Notifications'
              )}
            </Button>
          </div>

          <div>
            <Button
              onClick={fetchFcmToken}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Token Status
            </Button>
          </div>

          <div>
            <Button
              onClick={handleTestNotification}
              variant="outline"
              className="w-full bg-blue-50 hover:bg-blue-100 border-blue-300"
              disabled={permissionStatus !== 'granted'}
            >
              🔔 Send Test Notification (Local)
            </Button>
            <p className="text-xs text-gray-500 mt-1 text-center">
              This tests browser notifications without FCM
            </p>
          </div>

          {testResult && (
            <div className={`p-4 rounded ${testResult.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {testResult}
            </div>
          )}
        </div>
      </Card>

      {debugInfo && (
        <Card className="p-6 mb-6 bg-gray-50">
          <h3 className="font-semibold text-gray-900 mb-2">🔍 Browser Debug Info</h3>
          <pre className="text-xs bg-white p-3 rounded border overflow-x-auto whitespace-pre-wrap">
            {debugInfo}
          </pre>
        </Card>
      )}

      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">📋 Troubleshooting Steps</h3>
        <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
          <li>
            <strong>VAPID Key Missing:</strong> Generate key in Firebase Console → Project Settings → Cloud Messaging → Web Push certificates. Add to <code className="bg-blue-100 px-1 rounded">.env.local</code> as <code className="bg-blue-100 px-1 rounded">NEXT_PUBLIC_FIREBASE_VAPID_KEY</code>
          </li>
          <li>
            <strong>Permission Denied:</strong> Clear browser notification settings and try again. On Chrome: Settings → Privacy and security → Site Settings → Notifications
          </li>
          <li>
            <strong>Token Not Stored:</strong> Check browser console for errors. Ensure user is authenticated and VAPID key is correct.
          </li>
          <li>
            <strong>Service Worker Failed:</strong> Ensure <code className="bg-blue-100 px-1 rounded">firebase-messaging-sw.js</code> exists in <code className="bg-blue-100 px-1 rounded">public/</code> folder
          </li>
          <li>
            <strong>Mobile Issues:</strong> Some mobile browsers have limited notification support. Test on Chrome/Safari for best results.
          </li>
        </ol>
      </Card>

      <div className="mt-6 text-center">
        <Button variant="ghost" onClick={() => window.location.href = '/'}>
          ← Back to Home
        </Button>
      </div>
    </div>
  );
}