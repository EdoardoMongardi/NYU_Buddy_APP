'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Download, X, Users } from 'lucide-react';

import ActivityFeed from '@/components/activity/ActivityFeed';
import CategoryFilter from '@/components/activity/CategoryFilter';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePendingConfirmations } from '@/lib/hooks/usePendingConfirmations';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useInstallation } from '@/lib/hooks/useInstallation';
import { DidYouMeetDialog } from '@/components/match/DidYouMeetDialog';
import IOSInstallGuide from '@/components/installation/IOSInstallGuide';
import AndroidInstallGuide from '@/components/installation/AndroidInstallGuide';
import IOSSafariPrompt from '@/components/installation/IOSSafariPrompt';
import { getIOSBrowserName } from '@/lib/utils/platform';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useActivityFeed } from '@/lib/hooks/useActivityFeed';
import { useNav } from '@/context/NavContext';

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { pendingMatches } = usePendingConfirmations();
  const { setNavVisible } = useNav();

  // ── Activity Feed State ──
  const {
    posts,
    loading,
    error,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    categoryFilter,
    setCategory,
  } = useActivityFeed();

  // ── Scroll & Header Visibility ──
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      // Disable scroll-hide on desktop (md breakpoint)
      if (window.matchMedia('(min-width: 768px)').matches) {
        setShowHeader(true);
        return;
      }

      const currentScrollY = window.scrollY;

      // Threshold to avoid jitter
      if (Math.abs(currentScrollY - lastScrollY.current) < 10) return;

      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling Down -> Hide
        setShowHeader(false);
        setNavVisible(false);
      } else if (currentScrollY < lastScrollY.current) {
        // Scrolling Up -> Show
        setShowHeader(true);
        setNavVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [setNavVisible]);

  // ── PWA standalone detection ──
  const [isPWA, setIsPWA] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsPWA(standalone);
  }, []);

  // ── Sub-tab: For You / Following ──
  const [feedTab, setFeedTab] = useState<'for-you' | 'following'>('for-you');

  // ── Notification bubble ──
  const { isSupported: notifSupported, permissionStatus, requestPermission } = useNotifications();
  const [notifDismissed, setNotifDismissed] = useState(true);
  const [notifRequesting, setNotifRequesting] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('notificationPromptDismissed') === 'true';
    setNotifDismissed(dismissed);
  }, []);

  const showNotifBubble = notifSupported && permissionStatus !== 'granted' && !notifDismissed;

  const handleEnableNotifications = async () => {
    setNotifRequesting(true);
    await requestPermission();
    setNotifRequesting(false);
  };

  const dismissNotif = () => {
    setNotifDismissed(true);
    localStorage.setItem('notificationPromptDismissed', 'true');
  };

  // ── Install bubble ──
  const {
    platform,
    shouldShowBanner: showInstallBubble,
    isInstallPromptAvailable,
    dismissFor24Hours,
    triggerInstallPrompt,
  } = useInstallation();

  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [showIOSSafariPrompt, setShowIOSSafariPrompt] = useState(false);

  const handleInstall = async () => {
    if (platform.isIOSSafari) { setShowIOSGuide(true); return; }
    if (platform.isIOS && !platform.isIOSSafari) { setShowIOSSafariPrompt(true); return; }
    if (platform.isAndroid && isInstallPromptAvailable) {
      const accepted = await triggerInstallPrompt();
      if (!accepted) setShowAndroidGuide(true);
      return;
    }
    if (platform.isAndroid) { setShowAndroidGuide(true); return; }
  };

  // ── Cancelled match toast ──
  useEffect(() => {
    if (searchParams.get('cancelled') === 'true') {
      router.replace('/');
      const reason = searchParams.get('reason');
      const isBlocked = reason === 'blocked';
      toast({
        title: isBlocked ? "Match Ended" : "Meetup Cancelled",
        description: isBlocked ? "The other user is no longer available." : "The meetup was cancelled.",
        variant: "destructive",
      });
    }
  }, [searchParams, toast, router]);

  const emailVerified = user?.emailVerified;

  return (
    <div
      className="max-w-md mx-auto min-h-screen flex flex-col relative bg-white"
    >
      {/* DidYouMeet dialog */}
      {pendingMatches.length > 0 && (
        <DidYouMeetDialog open={true} matchId={pendingMatches[0].matchId} otherUserName={pendingMatches[0].otherDisplayName} otherUserPhotoURL={pendingMatches[0].otherPhotoURL} activity={pendingMatches[0].activity} onComplete={() => { }} />
      )}

      {/* ── HEADER GROUP (Sticky/Animated) ── */}
      <div
        className={`fixed top-0 left-0 right-0 z-30 max-w-md mx-auto bg-white/95 backdrop-blur-md shadow-sm transition-transform duration-300 ease-in-out border-b border-gray-100 flex flex-col md:!transform-none`}
        style={{ transform: showHeader ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        {/* Row 1: Title + Action Icons */}
        <div className={`flex items-center justify-between px-5 ${isPWA ? 'pt-2 pb-1' : 'pt-3 pb-1'}`}>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">NYU Buddy</h1>

          {/* Notification / Install bubble */}
          <AnimatePresence mode="wait">
            {showNotifBubble && (
              <motion.div
                key="notif"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5 bg-violet-50 text-violet-600 rounded-full pl-3 pr-2 py-1.5 border border-violet-100/60"
              >
                <Bell className="w-3.5 h-3.5 flex-shrink-0" />
                <button
                  onClick={handleEnableNotifications}
                  disabled={notifRequesting}
                  className="text-[12px] font-medium whitespace-nowrap"
                >
                  {notifRequesting ? 'Enabling...' : 'Notifications'}
                </button>
                <button onClick={dismissNotif} className="p-1 hover:bg-violet-100 rounded-full">
                  <X className="w-3.5 h-3.5 text-violet-400" />
                </button>
              </motion.div>
            )}
            {!showNotifBubble && showInstallBubble && (
              <motion.div
                key="install"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5 bg-violet-50 text-violet-600 rounded-full pl-3 pr-2 py-1.5 border border-violet-100/60"
              >
                <Download className="w-3.5 h-3.5 flex-shrink-0" />
                <button onClick={handleInstall} className="text-[12px] font-medium whitespace-nowrap">
                  Install
                </button>
                <button onClick={dismissFor24Hours} className="p-1 hover:bg-violet-100 rounded-full">
                  <X className="w-3.5 h-3.5 text-violet-400" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Row 2: Sub-tabs (X-style) */}
        {/* Note: In previous version this had a verified check, keeping it */}
        {emailVerified && (
          <div className="flex relative mt-1">
            <button
              onClick={() => setFeedTab('for-you')}
              className={`flex-1 py-3 text-[14px] font-semibold text-center transition-colors ${feedTab === 'for-you' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              For you
            </button>
            <button
              onClick={() => setFeedTab('following')}
              className={`flex-1 py-3 text-[14px] font-semibold text-center transition-colors ${feedTab === 'following' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              Following
            </button>
            {/* Animated underline indicator */}
            <motion.div
              className="absolute bottom-0 h-[3px] bg-violet-600 rounded-full"
              animate={{
                left: feedTab === 'for-you' ? '0%' : '50%',
                width: '50%',
              }}
              transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            />
          </div>
        )}

        {/* Row 3: Category Filters */}
        <div className="py-2 px-4 shadow-sm">
          <CategoryFilter selected={categoryFilter} onSelect={setCategory} />
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      {/* Padding top adjusted for header height ≈ 150px */}
      <div
        className="flex-1 w-full"
        style={{ paddingTop: '150px' }}
      >
        {!emailVerified ? (
          <div className="bg-amber-50/80 border border-amber-100 rounded-2xl p-6 text-center mx-5 mt-4">
            <h3 className="font-semibold text-amber-800 mb-2">Verify Your Email</h3>
            <p className="text-amber-700 text-sm">Please verify your NYU email address to access all features. Check your inbox for the verification link.</p>
          </div>
        ) : (
          <div className="min-h-full">
            <AnimatePresence mode="popLayout" initial={false}>
              {feedTab === 'for-you' ? (
                <motion.div
                  key="for-you"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ActivityFeed
                    posts={posts}
                    loading={loading}
                    error={error}
                    loadingMore={loadingMore}
                    hasMore={hasMore}
                    refresh={refresh}
                    loadMore={loadMore}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="following"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col items-center justify-center py-20 px-5"
                >
                  <Users className="w-12 h-12 text-gray-200 mb-4" />
                  <p className="text-lg font-medium text-gray-600 mb-1">Coming soon</p>
                  <p className="text-sm text-gray-400 text-center">Follow users to see their posts here</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Install guide modals */}
      <IOSInstallGuide isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
      <AndroidInstallGuide isOpen={showAndroidGuide} onClose={() => setShowAndroidGuide(false)} />
      <IOSSafariPrompt isOpen={showIOSSafariPrompt} onClose={() => setShowIOSSafariPrompt(false)} browserName={getIOSBrowserName(platform)} />
    </div>
  );
}
