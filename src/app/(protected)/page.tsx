'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Download, X } from 'lucide-react';

import AvailabilitySheet from '@/components/availability/AvailabilitySheet';
import SuggestionCard from '@/components/matching/SuggestionCard';
import TabNavigation from '@/components/home/TabNavigation';
import InvitesTab from '@/components/home/InvitesTab';
import { ActiveInvitesRow } from '@/components/match/ActiveInvitesRow';
import { usePresence } from '@/lib/hooks/usePresence';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOffers } from '@/lib/hooks/useOffers';
import { useToast } from '@/hooks/use-toast';
import MatchOverlay from '@/components/match/MatchOverlay';
import { DidYouMeetDialog } from '@/components/match/DidYouMeetDialog';
import { usePendingConfirmations } from '@/lib/hooks/usePendingConfirmations';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useInstallation } from '@/lib/hooks/useInstallation';
import IOSInstallGuide from '@/components/installation/IOSInstallGuide';
import AndroidInstallGuide from '@/components/installation/AndroidInstallGuide';
import IOSSafariPrompt from '@/components/installation/IOSSafariPrompt';
import { getIOSBrowserName } from '@/lib/utils/platform';

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, userProfile } = useAuth();
  const { isAvailable, presence } = usePresence();
  const [showMatchOverlay, setShowMatchOverlay] = useState<string | null>(null);
  const { pendingMatches } = usePendingConfirmations();

  // ── PWA standalone detection ──
  const [isPWA, setIsPWA] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsPWA(standalone);
  }, []);

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

  // ── Standard page logic ──
  const isAcceptingRef = useRef(false);

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

  const {
    inboxOffers, inboxCount, inboxLoading, inboxError,
    fetchInbox, respondToOffer,
    outgoingOffers, canSendMore, fetchOutgoing, cancelOutgoingOffer,
  } = useOffers();

  const [activeTab, setActiveTab] = useState<'discover' | 'invites'>('discover');
  const emailVerified = user?.emailVerified;

  useEffect(() => {
    if (isAvailable && emailVerified) { fetchInbox(); fetchOutgoing(); }
  }, [isAvailable, emailVerified, fetchInbox, fetchOutgoing]);

  useEffect(() => {
    if (!isAvailable || !emailVerified) return;
    const interval = setInterval(() => { fetchInbox(); fetchOutgoing(); }, 30000);
    return () => clearInterval(interval);
  }, [isAvailable, emailVerified, fetchInbox, fetchOutgoing]);

  useEffect(() => {
    if (isAcceptingRef.current) return;
    if (presence?.matchId && presence.status === 'matched') {
      setShowMatchOverlay(presence.matchId);
    } else if (showMatchOverlay && (!presence || presence.status !== 'matched')) {
      setShowMatchOverlay(null);
    }
  }, [presence, showMatchOverlay]);

  useEffect(() => {
    if (showMatchOverlay) return;
    if (isAcceptingRef.current) return;
    if (!presence?.matchId || presence.status !== 'matched') return;
    const acceptedOffer = outgoingOffers.find(o => o.status === 'accepted' && o.matchId);
    if (acceptedOffer) setShowMatchOverlay(acceptedOffer.matchId || null);
  }, [outgoingOffers, showMatchOverlay, presence]);

  const handleMatchOverlayComplete = () => { if (showMatchOverlay) router.push(`/match/${showMatchOverlay}`); };
  const handleAcceptOffer = async (offerId: string) => { isAcceptingRef.current = true; try { return await respondToOffer(offerId, 'accept'); } catch (error) { isAcceptingRef.current = false; throw error; } };
  const handleDeclineOffer = async (offerId: string) => { await respondToOffer(offerId, 'decline'); };
  const handleCancelOffer = async (offerId: string) => { await cancelOutgoingOffer(offerId); };

  return (
    <div
      className="max-w-md mx-auto h-full overflow-hidden flex flex-col"
      style={{ overscrollBehavior: 'none', touchAction: 'manipulation' }}
    >
      {showMatchOverlay && user && (
        <MatchOverlay matchId={showMatchOverlay} currentUserId={user.uid} currentUserPhoto={userProfile?.photoURL} onComplete={handleMatchOverlayComplete} isSender={outgoingOffers.some(o => o.status === 'accepted' && o.matchId === showMatchOverlay)} />
      )}
      {!showMatchOverlay && pendingMatches.length > 0 && (
        <DidYouMeetDialog open={true} matchId={pendingMatches[0].matchId} otherUserName={pendingMatches[0].otherDisplayName} otherUserPhotoURL={pendingMatches[0].otherPhotoURL} activity={pendingMatches[0].activity} onComplete={() => {}} />
      )}

      {/* Title row — "Find a Buddy" + notification/install bubble */}
      <div className={`flex items-center justify-between shrink-0 ${isPWA ? 'pt-1.5 pb-2' : 'pt-1 pb-1.5'}`}>
        <h1 className="text-[22px] font-bold text-gray-800 tracking-tight">Find a Buddy</h1>

        {/* Notification bubble — only one of these shows at a time (mutually exclusive on iOS) */}
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

      {!emailVerified ? (
        <div className="bg-amber-50/80 border border-amber-100 rounded-2xl p-6 text-center">
          <h3 className="font-semibold text-amber-800 mb-2">Verify Your Email</h3>
          <p className="text-amber-700 text-sm">Please verify your NYU email address to access all features. Check your inbox for the verification link.</p>
        </div>
      ) : (
        <>
          <div className="shrink-0">
            <AvailabilitySheet isPWA={isPWA} />
          </div>

          {isAvailable && (
            <div className={`shrink-0 ${isPWA ? 'mt-2' : 'mt-1.5'}`}>
              <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} inviteCount={inboxCount} />
            </div>
          )}

          <div className={`flex-1 overflow-hidden min-h-0 ${isPWA ? 'mt-1' : ''}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              {activeTab === 'discover' ? (
                <motion.div
                  key="discover"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  {outgoingOffers.length > 0 && (
                    <ActiveInvitesRow offers={outgoingOffers} onCancel={handleCancelOffer} />
                  )}
                  <SuggestionCard isAvailable={isAvailable} canSendMore={canSendMore} isPWA={isPWA} />
                </motion.div>
              ) : (
                <motion.div
                  key="invites"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <InvitesTab offers={inboxOffers} loading={inboxLoading} error={inboxError} onRefresh={fetchInbox} onAccept={handleAcceptOffer} onDecline={handleDeclineOffer} isAvailable={isAvailable} userPhotoURL={userProfile?.photoURL} userDisplayName={userProfile?.displayName} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Install guide modals */}
      <IOSInstallGuide isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
      <AndroidInstallGuide isOpen={showAndroidGuide} onClose={() => setShowAndroidGuide(false)} />
      <IOSSafariPrompt isOpen={showIOSSafariPrompt} onClose={() => setShowIOSSafariPrompt(false)} browserName={getIOSBrowserName(platform)} />
    </div>
  );
}
