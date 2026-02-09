'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, MoreVertical, Download, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Android Installation Guide Modal
 * Shows step-by-step visual guide for installing PWA on Android
 */

interface AndroidInstallGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AndroidInstallGuide({ isOpen, onClose }: AndroidInstallGuideProps) {
  if (!isOpen) return null;

  const steps = [
    {
      icon: MoreVertical,
      title: 'Open Menu',
      description: 'Tap the three-dot menu icon in the browser',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      icon: Download,
      title: 'Install App / Add to Home Screen',
      description: 'Look for "Install app" or "Add to Home screen" option',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    {
      icon: Home,
      title: 'Tap Install',
      description: 'Confirm installation and open from home screen',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
    },
  ];

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
                  <h2 className="text-xl font-bold">Install NYU Buddy</h2>
                  <p className="text-sm text-violet-100 mt-1">
                    Follow these simple steps
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  aria-label="Close guide"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Steps */}
            <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] sm:max-h-96 overflow-y-auto">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={index} className="flex items-start gap-4">
                    {/* Step Number Badge */}
                    <div className="flex-shrink-0 w-8 h-8 bg-violet-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${step.iconBg} flex-shrink-0`}>
                          <Icon className={`w-5 h-5 ${step.iconColor}`} />
                        </div>
                        <h3 className="font-semibold text-gray-900">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600 ml-11">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-start gap-2 mb-4">
                <div className="bg-blue-50 p-2 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  <strong className="text-gray-900">Note:</strong><br />
                  The exact wording may vary depending on your browser (Chrome, Firefox, Edge, etc.)
                </p>
              </div>

              <Button
                onClick={onClose}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                Got it!
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}