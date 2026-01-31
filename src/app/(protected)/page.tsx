'use client';

import { useState, useEffect } from 'react';
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

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, userProfile } = useAuth();
  const { isAvailable, presence } = usePresence();
  const [showMatchOverlay, setShowMatchOverlay] = useState<string | null>(null);

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
    if (presence?.matchId && presence.status === 'matched') {
      setShowMatchOverlay(presence.matchId);
    }
  }, [presence]);

  // Fallback: Redirect if offer is accepted (Legacy/Backup)
  useEffect(() => {
    if (showMatchOverlay) return; // Prioritize overlay

    const acceptedOffer = outgoingOffers.find(o => o.status === 'accepted' && o.matchId);
    if (acceptedOffer) {
      setShowMatchOverlay(acceptedOffer.matchId || null);
    }
  }, [outgoingOffers, showMatchOverlay]);

  const handleMatchOverlayComplete = () => {
    if (showMatchOverlay) {
      router.push(`/match/${showMatchOverlay}`);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    const result = await respondToOffer(offerId, 'accept');
    if (result && result.matchId) {
      setShowMatchOverlay(result.matchId);
    }
    return result;
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
          onComplete={handleMatchOverlayComplete}
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex justify-between items-start"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Find a Buddy</h1>
          <p className="text-gray-600">
            Connect with nearby NYU students
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/profile')}
          className="rounded-full hover:bg-violet-100"
        >
          <Settings className="w-6 h-6 text-gray-600" />
        </Button>
      </motion.div>

      {!emailVerified ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center"
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <AvailabilitySheet />
          </motion.div>

          {isAvailable && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <TabNavigation
                activeTab={activeTab}
                onTabChange={setActiveTab}
                inviteCount={inboxCount}
              />
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <AnimatePresence mode="wait">
              {activeTab === 'discover' ? (
                <motion.div
                  key="discover"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
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
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
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