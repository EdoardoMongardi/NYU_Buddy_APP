'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import AvailabilitySheet from '@/components/availability/AvailabilitySheet';
import SuggestionCard from '@/components/matching/SuggestionCard';
import SubTabNavigation from '@/components/home/SubTabNavigation';
import InvitesTab from '@/components/home/InvitesTab';
import { ActiveInvitesRow } from '@/components/match/ActiveInvitesRow';
import { usePresence } from '@/lib/hooks/usePresence';
import { useAuth } from '@/lib/hooks/useAuth';
import { useOffers } from '@/lib/hooks/useOffers';

import MatchOverlay from '@/components/match/MatchOverlay';
import { useRouter } from 'next/navigation';

interface InstantMatchTabProps {
    isPWA: boolean;
}

export default function InstantMatchTab({ isPWA }: InstantMatchTabProps) {
    const router = useRouter();
    const { user, userProfile } = useAuth();
    const { isAvailable, presence } = usePresence();
    const isAcceptingRef = useRef(false);
    const [showMatchOverlay, setShowMatchOverlay] = useState<string | null>(null);

    const emailVerified = user?.emailVerified;

    const {
        inboxOffers, inboxCount, inboxLoading, inboxError,
        fetchInbox, respondToOffer,
        outgoingOffers, canSendMore, fetchOutgoing, cancelOutgoingOffer,
    } = useOffers();

    const [subTab, setSubTab] = useState<'discover' | 'invites'>('discover');

    useEffect(() => {
        if (isAvailable && emailVerified) { fetchInbox(); fetchOutgoing(); }
    }, [isAvailable, emailVerified, fetchInbox, fetchOutgoing]);

    useEffect(() => {
        if (!isAvailable || !emailVerified) return;
        const interval = setInterval(() => { fetchInbox(); fetchOutgoing(); }, 30000);
        return () => clearInterval(interval);
    }, [isAvailable, emailVerified, fetchInbox, fetchOutgoing]);

    const isMatched = presence?.matchId && presence.status === 'matched';

    useEffect(() => {
        if (isAcceptingRef.current) return;

        if (isMatched && presence.matchId) {
            // Check if we've already shown the overlay for this specific match.
            // Using sessionStorage means it resets if they fully close and reopen the app,
            // but persists cleanly during a single app session.
            const sessionKey = `seen_overlay_${presence.matchId}`;
            const hasSeen = sessionStorage.getItem(sessionKey);

            if (!hasSeen) {
                // First time seeing this match -> trigger celebration overlay
                sessionStorage.setItem(sessionKey, 'true');
                setShowMatchOverlay(presence.matchId);
            } else if (!showMatchOverlay) {
                // Already saw the overlay for this match -> skip celebration, go straight to chat
                // Only push if we aren't currently showing the overlay to prevent interrupting it
                router.push(`/match/${presence.matchId}`);
            }
        } else if (showMatchOverlay && !isMatched) {
            setShowMatchOverlay(null);
        }
    }, [isMatched, presence, showMatchOverlay, router]);

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

    if (!emailVerified) {
        return (
            <div className="bg-amber-50/80 border border-amber-100 rounded-2xl p-6 text-center mx-4 mt-6">
                <h3 className="font-semibold text-amber-800 mb-2">Verify Your Email</h3>
                <p className="text-amber-700 text-sm">Please verify your NYU email to use Instant Match.</p>
            </div>
        );
    }

    return (
        <div
            className="max-w-md mx-auto h-full overflow-hidden flex flex-col px-5 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:pt-4"
            style={{ overscrollBehavior: 'none', touchAction: 'manipulation' }}
        >
            {showMatchOverlay && user && (
                <MatchOverlay matchId={showMatchOverlay} currentUserId={user.uid} currentUserPhoto={userProfile?.photoURL} onComplete={handleMatchOverlayComplete} isSender={outgoingOffers.some(o => o.status === 'accepted' && o.matchId === showMatchOverlay)} />
            )}

            {/* Header */}
            <div className="shrink-0 pt-2 pb-1">
                <h2 className="text-[20px] font-bold text-gray-900">Instant Match</h2>
            </div>

            {/* Availability sheet */}
            <div className="shrink-0 mt-1">
                <AvailabilitySheet isPWA={isPWA} />
            </div>

            {/* Sub-tabs: Discover / Invites */}
            {isAvailable && (
                <div className="shrink-0 mt-2">
                    <SubTabNavigation activeTab={subTab} onTabChange={setSubTab} inviteCount={inboxCount} />
                </div>
            )}

            <div className="flex-1 overflow-hidden min-h-0 mt-1">
                <AnimatePresence mode="popLayout" initial={false}>
                    {isMatched ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="animate-spin text-gray-400 w-8 h-8 rounded-full border-2 border-t-violet-500 border-r-transparent border-b-transparent border-l-transparent"></div>
                        </div>
                    ) : subTab === 'discover' ? (
                        <motion.div
                            key="discover"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="h-full"
                            style={{ touchAction: 'none' }}
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
        </div>
    );
}
