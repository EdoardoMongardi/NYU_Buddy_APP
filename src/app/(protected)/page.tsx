'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import AvailabilitySheet from '@/components/availability/AvailabilitySheet';
import SuggestionCard from '@/components/matching/SuggestionCard';
import TabNavigation from '@/components/home/TabNavigation';
import InvitesTab from '@/components/home/InvitesTab';
import { ActiveInvitesRow } from '@/components/match/ActiveInvitesRow';
import { usePresence } from '@/lib/hooks/usePresence';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOffers } from '@/lib/hooks/useOffers';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  // ── Contextual greeting (purely cosmetic, no business logic) ──
  const [greeting, setGreeting] = useState('');
  const [contextSubtitle, setContextSubtitle] = useState('Connect with nearby NYU students');

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(
      h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Hey there'
    );
    setContextSubtitle(
      h < 11 ? 'Start your day with a study buddy'
        : h < 14 ? 'Who\u2019s around for lunch?'
        : h < 17 ? 'Find your afternoon buddy'
        : h < 21 ? 'Wind down with someone nearby'
        : 'Find a late-night study partner'
    );
  }, []);

  const firstName = userProfile?.displayName?.split(' ')[0];

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
      // Presence says user is NOT matched (or presence is null/deleted) — clear any stale overlay.
      // This handles the case where cached Firestore data briefly shows
      // an accepted offer or matched presence before the server update arrives.
      // Also handles presence deletion by cleanup (when presence becomes null).
      setShowMatchOverlay(null);
    }
  }, [presence, showMatchOverlay]);

  // Fallback: Redirect if offer is accepted (Legacy/Backup)
  // Only trust accepted offers if presence ALSO confirms user is matched.
  // Without this guard, stale cached offer data from Firestore local persistence
  // can trigger a redirect back to a completed/cancelled match.
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
    // Set suppression flag to block Presence Overlay
    isAcceptingRef.current = true;
    try {
      const result = await respondToOffer(offerId, 'accept');
      // Intentionally NOT setting showMatchOverlay here.
      // InvitesTab will handle the redirect.
      return result;
    } catch (error) {
      isAcceptingRef.current = false; // Reset on failure
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
    <div className="max-w-md mx-auto space-y-6">
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

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex justify-between items-start"
      >
        <div>
          {greeting && (
            <p className="text-[13px] font-medium text-violet-500/70 mb-0.5">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </p>
          )}
          <h1 className="text-[22px] font-bold text-gray-800 tracking-tight">Find a Buddy</h1>
          <p className="text-[15px] text-gray-400 mt-0.5">
            {contextSubtitle}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/profile')}
          className="rounded-full hover:bg-gray-100 touch-scale h-11 w-11 mt-1"
        >
          <Settings className="w-5 h-5 text-gray-400" />
        </Button>
      </motion.div>

      {!emailVerified ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="bg-amber-50/80 border border-amber-100 rounded-2xl p-6 text-center"
        >
          <h3 className="font-semibold text-amber-800 mb-2">
            Verify Your Email
          </h3>
          <p className="text-amber-700 text-sm">
            Please verify your NYU email address to access all features.
            Check your inbox for the verification link.
          </p>
        </motion.div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <AvailabilitySheet />
          </motion.div>

          {isAvailable && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <TabNavigation
                activeTab={activeTab}
                onTabChange={setActiveTab}
                inviteCount={inboxCount}
              />
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
          >
            <AnimatePresence mode="wait">
              {activeTab === 'discover' ? (
                <motion.div
                  key="discover"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Show active invites if exist */}
                  {outgoingOffers.length > 0 && (
                    <ActiveInvitesRow
                      offers={outgoingOffers}
                      onCancel={handleCancelOffer}
                    />
                  )}

                  {/* Always show suggestion card (unless functionality changes) */}
                  <SuggestionCard
                    isAvailable={isAvailable}
                    canSendMore={canSendMore}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="invites"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
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
          </motion.div>
        </>
      )}
    </div>
  );
}