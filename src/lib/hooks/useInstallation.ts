/**
 * Installation hook for managing PWA installation state
 * Handles localStorage, Android install prompt, and install events
 */

import { useState, useEffect } from 'react';
import { getPlatformInfo, type PlatformInfo } from '@/lib/utils/platform';

const STORAGE_KEYS = {
  DISMISS_UNTIL: 'installBannerDismissUntil',
  INSTALLED: 'installBannerInstalled',
} as const;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface UseInstallationReturn {
  platform: PlatformInfo;
  shouldShowBanner: boolean;
  isInstallPromptAvailable: boolean;
  dismissFor24Hours: () => void;
  markAsInstalled: () => void;
  triggerInstallPrompt: () => Promise<boolean>;
}

/**
 * Hook for managing PWA installation
 */
export function useInstallation(): UseInstallationReturn {
  const [platform, setPlatform] = useState<PlatformInfo>({
    isIOS: false,
    isAndroid: false,
    isDesktop: false,
    isIOSSafari: false,
    isIOSChrome: false,
    isIOSEdge: false,
    isIOSFirefox: false,
    isStandalone: false,
    canInstall: false,
  });

  const [shouldShowBanner, setShouldShowBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Initialize platform detection
  useEffect(() => {
    const platformInfo = getPlatformInfo();
    setPlatform(platformInfo);
  }, []);

  // Check if banner should be shown
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Don't show if already installed
    const isInstalled = localStorage.getItem(STORAGE_KEYS.INSTALLED) === 'true';
    if (isInstalled) {
      setShouldShowBanner(false);
      return;
    }

    // Don't show if in standalone mode (actually installed)
    if (platform.isStandalone) {
      // Mark as installed in localStorage
      localStorage.setItem(STORAGE_KEYS.INSTALLED, 'true');
      setShouldShowBanner(false);
      return;
    }

    // Don't show on desktop
    if (platform.isDesktop) {
      setShouldShowBanner(false);
      return;
    }

    // Check if dismissed and still within 24-hour window
    const dismissUntilStr = localStorage.getItem(STORAGE_KEYS.DISMISS_UNTIL);
    if (dismissUntilStr) {
      const dismissUntil = parseInt(dismissUntilStr, 10);
      const now = Date.now();
      if (now < dismissUntil) {
        setShouldShowBanner(false);
        return;
      }
    }

    // Show banner for iOS and Android users who haven't installed
    setShouldShowBanner(platform.isIOS || platform.isAndroid);
  }, [platform]);

  // Listen for beforeinstallprompt event (Android)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      console.log('[useInstallation] App installed via native prompt');
      markAsInstalled();
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * Dismiss banner for 24 hours
   */
  const dismissFor24Hours = () => {
    const dismissUntil = Date.now() + 24 * 60 * 60 * 1000; // 24 hours in ms
    localStorage.setItem(STORAGE_KEYS.DISMISS_UNTIL, dismissUntil.toString());
    setShouldShowBanner(false);
  };

  /**
   * Mark app as installed permanently
   */
  const markAsInstalled = () => {
    localStorage.setItem(STORAGE_KEYS.INSTALLED, 'true');
    setShouldShowBanner(false);
  };

  /**
   * Trigger Android native install prompt
   * Returns true if user accepted, false otherwise
   */
  const triggerInstallPrompt = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      console.warn('[useInstallation] No deferred prompt available');
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      console.log(`[useInstallation] User choice: ${outcome}`);

      if (outcome === 'accepted') {
        markAsInstalled();
        setDeferredPrompt(null);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[useInstallation] Error triggering install prompt:', error);
      return false;
    }
  };

  return {
    platform,
    shouldShowBanner,
    isInstallPromptAvailable: !!deferredPrompt,
    dismissFor24Hours,
    markAsInstalled,
    triggerInstallPrompt,
  };
}