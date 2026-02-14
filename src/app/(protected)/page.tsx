'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

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

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, userProfile } = useAuth();
  const { isAvailable, presence } = usePresence();
  const [showMatchOverlay, setShowMatchOverlay] = useState<string | null>(null);
  const { pendingMatches } = usePendingConfirmations();

  // ── Contextual subtitle (only shown before availability is set) ──
  const [contextSubtitle, setContextSubtitle] = useState('Connect with nearby NYU students');

  useEffect(() => {
    const h = new Date().getHours();
    setContextSubtitle(
      h < 11 ? 'Start your day with a study buddy'
        : h < 14 ? 'Who\u2019s around for lunch?'
        : h < 17 ? 'Find your afternoon buddy'
        : h < 21 ? 'Wind down with someone nearby'
        : 'Find a late-night study partner'
    );
  }, []);

  // Suppression flag: If true, we are currently accepting an offer manually,
  // so we should suppress the banner (and let InvitesTab redirect).
  const isAcceptingRef = useRef(false);

  useEffect(() => {
    if (searchParams.get('cancelled') === 'true') {
      // Clear the param
      router.replace('/');

      const reason = searchParams.get('reason');
      const isBlocked = reason === 'blocked';

      toast({
        title: isBlocked ? "Match Ended" : "Meetup Cancelled",
        description: isBlocked
          ? "The other user is no longer available."
          : "The meetup was cancelled.",
        variant: "destructive",
      });
    }
  }, [searchParams, toast, router]);

  const {
    inboxOffers,
    inboxCount,
    inboxLoading,
    inboxError,
    fetchInbox,
    respondToOffer,
    outgoingOffers,
    canSendMore,
    fetchOutgoing,
    cancelOutgoingOffer,
  } = useOffers();

  const [activeTab, setActiveTab] = useState<'discover' | 'invites'>('discover');

  // Block features if email not verified
  const emailVerified = user?.emailVerified;

  // Fetch offers when available
  useEffect(() => {
    if (isAvailable && emailVerified) {
      fetchInbox();
      fetchOutgoing();
    }
  }, [isAvailable, emailVerified, fetchInbox, fetchOutgoing]);

  // Refresh inbox periodically
  useEffect(() => {
    if (!isAvailable || !emailVerified) return;

    const interval = setInterval(() => {
      fetchInbox();
      fetchOutgoing();
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isAvailable, emailVerified, fetchInbox, fetchOutgoing]);

  // Redirect if match detected via Presence (Canonical)
  useEffect(() => {
    // If we are actively accepting an invite, suppress the presence listener
    // to avoid the banner flashing before redirect.
    if (isAcceptingRef.current) return;

    if (presence?.matchId && presence.status === 'matched') {
      setShowMatchOverlay(presence.matchId);
    } else if (showMatchOverlay && (!presence || presence.status !== 'matched')) {
      setShowMatchOverlay(null);
    }
  }, [presence, showMatchOverlay]);

  // Fallback: Redirect if offer is accepted (Legacy/Backup)
  useEffect(() => {
    if (showMatchOverlay) return; // Prioritize overlay
    if (isAcceptingRef.current) return;
    if (!presence?.matchId || presence.status !== 'matched') return;

    const acceptedOffer = outgoingOffers.find(o => o.status === 'accepted' && o.matchId);
    if (acceptedOffer) {
      setShowMatchOverlay(acceptedOffer.matchId || null);
    }
  }, [outgoingOffers, showMatchOverlay, presence]);

  const handleMatchOverlayComplete = () => {
    if (showMatchOverlay) {
      router.push(`/match/${showMatchOverlay}`);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    isAcceptingRef.current = true;
    try {
      const result = await respondToOffer(offerId, 'accept');
      return result;
    } catch (error) {
      isAcceptingRef.current = false;
      throw error;
    }
  };

  const handleDeclineOffer = async (offerId: string) => {
    await respondToOffer(offerId, 'decline');
  };

  const handleCancelOffer = async (offerId: string) => {
    await cancelOutgoingOffer(offerId);
  };

  return (
    <div className="max-w-md mx-auto h-full overflow-hidden flex flex-col">
      {showMatchOverlay && user && (
        <MatchOverlay
          matchId={showMatchOverlay}
          currentUserId={user.uid}
          currentUserPhoto={userProfile?.photoURL}
          onComplete={handleMatchOverlayComplete}
          isSender={outgoingOffers.some(o => o.status === 'accepted' && o.matchId === showMatchOverlay)}
        />
      )}

      {/* "Did you meet?" popup — only when no active match overlay */}
      {!showMatchOverlay && pendingMatches.length > 0 && (
        <DidYouMeetDialog
          open={true}
          matchId={pendingMatches[0].matchId}
          otherUserName={pendingMatches[0].otherDisplayName}
          otherUserPhotoURL={pendingMatches[0].otherPhotoURL}
          activity={pendingMatches[0].activity}
          onComplete={() => {/* Hook auto-refreshes via onSnapshot */}}
        />
      )}

      {/* Header — only shown before availability is set */}
      {!isAvailable && (
        <div className="shrink-0 pb-2">
          <h1 className="text-[22px] font-bold text-gray-800 tracking-tight">Find a Buddy</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {contextSubtitle}
          </p>
        </div>
      )}

      {!emailVerified ? (
        <div className="bg-amber-50/80 border border-amber-100 rounded-2xl p-6 text-center mt-2">
          <h3 className="font-semibold text-amber-800 mb-2">
            Verify Your Email
          </h3>
          <p className="text-amber-700 text-sm">
            Please verify your NYU email address to access all features.
            Check your inbox for the verification link.
          </p>
        </div>
      ) : (
        <>
          <div className="shrink-0">
            <AvailabilitySheet />
          </div>

          {isAvailable && (
            <div className="shrink-0 mt-2">
              <TabNavigation
                activeTab={activeTab}
                onTabChange={setActiveTab}
                inviteCount={inboxCount}
              />
            </div>
          )}

          {/* Content area — fills remaining space, no scroll */}
          <div className="flex-1 overflow-hidden mt-2">
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
                  {/* Active invites if exist */}
                  {outgoingOffers.length > 0 && (
                    <ActiveInvitesRow
                      offers={outgoingOffers}
                      onCancel={handleCancelOffer}
                    />
                  )}

                  {/* Suggestion card */}
                  <SuggestionCard
                    isAvailable={isAvailable}
                    canSendMore={canSendMore}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="invites"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <InvitesTab
                    offers={inboxOffers}
                    loading={inboxLoading}
                    error={inboxError}
                    onRefresh={fetchInbox}
                    onAccept={handleAcceptOffer}
                    onDecline={handleDeclineOffer}
                    isAvailable={isAvailable}
                    userPhotoURL={userProfile?.photoURL}
                    userDisplayName={userProfile?.displayName}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
