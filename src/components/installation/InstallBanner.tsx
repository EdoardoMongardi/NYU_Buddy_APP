'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallation } from '@/lib/hooks/useInstallation';
import { getIOSBrowserName } from '@/lib/utils/platform';
import IOSInstallGuide from './IOSInstallGuide';
import AndroidInstallGuide from './AndroidInstallGuide';
import IOSSafariPrompt from './IOSSafariPrompt';

/**
 * Installation Banner for PWA
 * Shows platform-specific prompts to guide users to install the app
 * Styled to match NotificationPrompt banner
 */

export default function InstallBanner() {
  const {
    platform,
    shouldShowBanner,
    isInstallPromptAvailable,
    dismissFor24Hours,
    triggerInstallPrompt,
  } = useInstallation();

  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [showIOSSafariPrompt, setShowIOSSafariPrompt] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  if (!shouldShowBanner) return null;

  const handleInstall = async () => {
    // iOS Safari - show visual guide
    if (platform.isIOSSafari) {
      setShowIOSGuide(true);
      return;
    }

    // iOS non-Safari browsers - prompt to switch to Safari
    if (platform.isIOS && !platform.isIOSSafari) {
      setShowIOSSafariPrompt(true);
      return;
    }

    // Android with native install prompt available
    if (platform.isAndroid && isInstallPromptAvailable) {
      setIsInstalling(true);
      const accepted = await triggerInstallPrompt();
      setIsInstalling(false);

      if (!accepted) {
        // User dismissed native prompt - show manual guide
        setShowAndroidGuide(true);
      }
      return;
    }

    // Android without native install prompt - show manual guide
    if (platform.isAndroid) {
      setShowAndroidGuide(true);
      return;
    }
  };

  const handleLater = () => {
    dismissFor24Hours();
  };

  // Get display text based on platform
  const getDisplayText = () => {
    if (platform.isIOSSafari) {
      return {
        title: 'Add NYU Buddy to Home Screen',
        description: 'Install the app for the best experience and notifications',
        buttonText: 'How to Install',
      };
    }

    if (platform.isIOS && !platform.isIOSSafari) {
      const browserName = getIOSBrowserName(platform);
      return {
        title: `Install from Safari`,
        description: `${browserName} doesn't support app installation. Switch to Safari to install.`,
        buttonText: 'Switch to Safari',
      };
    }

    if (platform.isAndroid) {
      return {
        title: 'Install NYU Buddy',
        description: 'Add to home screen for quick access and offline support',
        buttonText: isInstalling ? 'Installing...' : 'Install App',
      };
    }

    return {
      title: 'Install NYU Buddy',
      description: 'Get the app for the best experience',
      buttonText: 'Install',
    };
  };

  const displayText = getDisplayText();

  return (
    <>
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
                  <Download className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-900">
                    {displayText.title}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5 hidden sm:block">
                    {displayText.description}
                  </p>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs px-3 py-1.5 h-auto whitespace-nowrap"
                >
                  {displayText.buttonText}
                </Button>
                <button
                  onClick={handleLater}
                  className="text-[10px] sm:text-xs text-gray-600 hover:text-gray-900 px-2 py-1.5 transition-colors whitespace-nowrap"
                  aria-label="Remind me later"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Platform-specific modals */}
      <IOSInstallGuide
        isOpen={showIOSGuide}
        onClose={() => setShowIOSGuide(false)}
      />

      <AndroidInstallGuide
        isOpen={showAndroidGuide}
        onClose={() => setShowAndroidGuide(false)}
      />

      <IOSSafariPrompt
        isOpen={showIOSSafariPrompt}
        onClose={() => setShowIOSSafariPrompt(false)}
        browserName={getIOSBrowserName(platform)}
      />
    </>
  );
}