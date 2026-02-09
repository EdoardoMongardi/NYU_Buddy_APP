'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * iOS Safari Prompt Modal
 * Prompts iOS Chrome/Edge/Firefox users to switch to Safari for installation
 * Primary: Copy link, Secondary: Open in Safari (best-effort)
 */

interface IOSSafariPromptProps {
  isOpen: boolean;
  onClose: () => void;
  browserName: string;
}

export default function IOSSafariPrompt({
  isOpen,
  onClose,
  browserName,
}: IOSSafariPromptProps) {
  const [copied, setCopied] = useState(false);
  const [openError, setOpenError] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleOpenInSafari = () => {
    // Best-effort attempt to open in Safari
    // This may or may not work depending on iOS version and settings
    try {
      // Try to open using custom URL scheme
      window.location.href = `x-safari-${currentUrl}`;

      // If that doesn't work after a delay, show manual instructions
      setTimeout(() => {
        setOpenError(true);
      }, 1000);
    } catch (error) {
      console.error('Failed to open in Safari:', error);
      setOpenError(true);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md bg-white rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Switch to Safari</h2>
                  <p className="text-sm text-violet-100 mt-1">
                    Install from Safari browser
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  aria-label="Close prompt"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Info message */}
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-700">
                    <strong className="text-gray-900">{browserName}</strong> doesn't support app installation on iOS.
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Please open this page in Safari to install NYU Buddy.
                  </p>
                </div>
              </div>

              {/* Step 1: Copy Link */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-violet-600 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
                    1
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    Copy the link
                  </p>
                </div>
                <Button
                  onClick={handleCopyLink}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Link Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>

              {/* Step 2: Open in Safari */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-violet-600 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
                    2
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    Open in Safari
                  </p>
                </div>

                {/* Try auto-open (best-effort) */}
                <Button
                  onClick={handleOpenInSafari}
                  variant="outline"
                  className="w-full border-violet-300 text-violet-700 hover:bg-violet-50 flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Try Opening in Safari
                </Button>

                {/* Manual instructions */}
                {(openError || copied) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                  >
                    <p className="text-xs text-gray-700 leading-relaxed">
                      <strong className="text-gray-900">If auto-open doesn't work:</strong><br />
                      1. Open Safari browser<br />
                      2. Tap address bar at the top<br />
                      3. Paste the copied link<br />
                      4. Press Go
                    </p>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <Button
                onClick={onClose}
                variant="ghost"
                className="w-full"
              >
                I'll do it later
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}