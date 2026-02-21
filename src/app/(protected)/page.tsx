'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Download, X } from 'lucide-react';

import ActivityFeed from '@/components/activity/ActivityFeed';
import AskedFeed from '@/components/activity/AskedFeed';
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
  const { navRef } = useNav();

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
  const headerRef = useRef<HTMLDivElement>(null);
  const headerContentRef = useRef<HTMLDivElement>(null);
  const headerOffset = useRef(0);
  const navOffset = useRef(0);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      // Disable scroll-hide on desktop (md breakpoint)
      if (window.matchMedia('(min-width: 768px)').matches) {
        if (headerRef.current) {
          headerRef.current.style.transform = 'translateY(0)';
        }
        if (headerContentRef.current) {
          headerContentRef.current.style.opacity = '1';
        }
        if (navRef.current) {
          navRef.current.style.transform = 'translateY(0)';
        }
        return;
      }

      const currentScrollY = window.scrollY;

      // Calculate delta
      const diff = currentScrollY - lastScrollY.current;
      lastScrollY.current = currentScrollY;

      // Ignore overscroll bouncing on iOS
      if (currentScrollY <= 0) {
        headerOffset.current = 0;
        navOffset.current = 0;
      } else {
        // Topbar max hide offset ~140px, Bottom bar max hide offset ~100px
        const maxHeaderOffset = 140;
        const maxNavOffset = 100;

        headerOffset.current = Math.min(0, Math.max(-maxHeaderOffset, headerOffset.current - diff));
        navOffset.current = Math.min(maxNavOffset, Math.max(0, navOffset.current + diff));
      }

      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          if (headerRef.current) {
            headerRef.current.style.transform = `translateY(${headerOffset.current}px)`;
          }
          if (headerContentRef.current) {
            const maxHeaderOffset = 140;
            const opacity = 1 - Math.abs(headerOffset.current) / maxHeaderOffset;
            headerContentRef.current.style.opacity = opacity.toString();
          }
          if (navRef.current) {
            navRef.current.style.transform = `translateY(${navOffset.current}px)`;
          }
          ticking.current = false;
        });

        ticking.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [navRef]);

  // ── PWA standalone detection ──
  const [isPWA, setIsPWA] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsPWA(standalone);
  }, []);

  // ── Sub-tab: For You / Asked ──
  const [feedTab, setFeedTab] = useState<'for-you' | 'asked'>('for-you');

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
      className="w-full mx-auto min-h-screen flex flex-col relative bg-white"
    >
      {/* DidYouMeet dialog */}
      {pendingMatches.length > 0 && (
        <DidYouMeetDialog open={true} matchId={pendingMatches[0].matchId} otherUserName={pendingMatches[0].otherDisplayName} otherUserPhotoURL={pendingMatches[0].otherPhotoURL} activity={pendingMatches[0].activity} onComplete={() => { }} />
      )}

      {/* ── HEADER GROUP (Sticky/Animated) ── */}
      <div
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-30 w-full md:max-w-[600px] mx-auto bg-white border-b border-gray-100 flex flex-col md:!transform-none`}
        style={{ transform: 'translateY(0)' }}
      >
        <div ref={headerContentRef} className="flex flex-col w-full h-full" style={{ opacity: 1 }}>
          {/* Row 1: Title (Mobile) + Action Icons */}
          <div className={`flex items-center justify-between px-4 relative ${isPWA ? 'pt-2 pb-1' : 'pt-3 pb-1'} ${!showNotifBubble && !showInstallBubble ? 'md:hidden' : ''}`}>
            <h1 className="md:hidden text-xl font-bold text-violet-600 tracking-tight">NYU Buddy</h1>

            <div className="flex-1 flex justify-end">
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
                onClick={() => setFeedTab('asked')}
                className={`flex-1 py-3 text-[14px] font-semibold text-center transition-colors ${feedTab === 'asked' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                  }`}
              >
                Asked
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
          <div className="py-2 px-4">
            <CategoryFilter selected={categoryFilter} onSelect={setCategory} />
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      {/* Padding top adjusted for header height ≈ 138px */}
      <div
        className="flex-1 w-full"
        style={{ paddingTop: '138px' }}
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
                  key="asked"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <AskedFeed />
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
