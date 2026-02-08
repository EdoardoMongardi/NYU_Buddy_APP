'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/lib/hooks/useNotifications';

/**
 * U16: Notification Permission Prompt
 * Shows a banner prompting users to enable push notifications
 */

export default function NotificationPrompt() {
  const { isSupported, permissionStatus, requestPermission } = useNotifications();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user previously dismissed (persist across sessions)
  useEffect(() => {
    const dismissed = localStorage.getItem('notificationPromptDismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }

    // Log why prompt might not be showing
    console.log('[NotificationPrompt] isSupported:', isSupported);
    console.log('[NotificationPrompt] permissionStatus:', permissionStatus);
    console.log('[NotificationPrompt] isDismissed:', dismissed === 'true');
    console.log('[NotificationPrompt] shouldShow:', isSupported && permissionStatus !== 'granted' && dismissed !== 'true');
  }, [isSupported, permissionStatus]);

  // Only show if:
  // 1. Notifications are supported
  // 2. Permission not granted
  // 3. Not dismissed by user
  const shouldShow = isSupported && permissionStatus !== 'granted' && !isDismissed;

  const handleEnableNotifications = async () => {
    setIsRequesting(true);
    setError(null);

    const result = await requestPermission();
    setIsRequesting(false);

    if (result.success) {
      // Permission granted - prompt will hide automatically
      console.log('[NotificationPrompt] Notifications enabled successfully');
    } else {
      // Permission denied or error
      console.log('[NotificationPrompt] Failed to enable notifications:', result.error);
      setError(result.error || 'Failed to enable notifications');
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    // Store dismissal in localStorage to persist across sessions
    localStorage.setItem('notificationPromptDismissed', 'true');
  };

  if (!shouldShow) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-gradient-to-r from-violet-50 to-purple-50 border-b border-violet-200 px-3 sm:px-4 py-3"
      >
        <div className="container mx-auto">
          <div className="flex items-start sm:items-center justify-between gap-3">
            {/* Icon and Text - Mobile: Column, Desktop: Row */}
            <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
              <div className="bg-violet-100 p-2 rounded-full flex-shrink-0">
                <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-900">
                  Enable notifications for updates
                </p>
                <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5 hidden sm:block">
                  Get notified when you receive offers or match with someone
                </p>
                {error && (
                  <div className="flex items-start gap-1 mt-2 text-[10px] sm:text-xs text-red-600">
                    <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span className="break-words">{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Button
                size="sm"
                onClick={handleEnableNotifications}
                disabled={isRequesting}
                className="bg-violet-600 hover:bg-violet-700 text-white text-xs px-3 py-1.5 h-auto"
              >
                {isRequesting ? 'Enabling...' : 'Enable'}
              </Button>
              <button
                onClick={handleDismiss}
                className="p-1.5 sm:p-2 hover:bg-violet-100 rounded-full transition-colors flex-shrink-0"
                aria-label="Dismiss notification prompt"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}