'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
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

  // Only show if:
  // 1. Notifications are supported
  // 2. Permission not granted
  // 3. Not dismissed by user
  const shouldShow = isSupported && permissionStatus !== 'granted' && !isDismissed;

  const handleEnableNotifications = async () => {
    setIsRequesting(true);
    const success = await requestPermission();
    setIsRequesting(false);

    if (success) {
      // Permission granted - prompt will hide automatically
      console.log('[NotificationPrompt] Notifications enabled successfully');
    } else {
      // Permission denied or error - keep the prompt visible
      console.log('[NotificationPrompt] Failed to enable notifications');
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
        className="bg-gradient-to-r from-violet-50 to-purple-50 border-b border-violet-200 px-4 py-3"
      >
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-violet-100 p-2 rounded-full">
              <Bell className="w-5 h-5 text-violet-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Enable notifications to get instant updates
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Get notified when you receive offers or match with someone
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleEnableNotifications}
              disabled={isRequesting}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isRequesting ? 'Enabling...' : 'Enable'}
            </Button>
            <button
              onClick={handleDismiss}
              className="p-2 hover:bg-violet-100 rounded-full transition-colors"
              aria-label="Dismiss notification prompt"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}