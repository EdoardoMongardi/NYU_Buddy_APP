'use client';

import { useState, useCallback, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from './useAuth';
import {
  offerCreate,
  offerRespond,
  offerCancel,
  offersGetInbox,
  offerGetOutgoing,
  InboxOffer,
  OutgoingOffer,
} from '@/lib/firebase/functions';

export function useOffers() {
  const { user } = useAuth();
  // Inbox state
  const [inboxOffers, setInboxOffers] = useState<InboxOffer[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);

  // Outgoing state
  const [outgoingOffer, setOutgoingOffer] = useState<OutgoingOffer | null>(null);
  const [hasActiveOffer, setHasActiveOffer] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [outgoingLoading, setOutgoingLoading] = useState(false);
  const [outgoingError, setOutgoingError] = useState<string | null>(null);

  // Create offer
  const [createLoading, setCreateLoading] = useState(false);

  // Fetch inbox offers
  const fetchInbox = useCallback(async () => {
    setInboxLoading(true);
    setInboxError(null);

    try {
      const result = await offersGetInbox();
      setInboxOffers(result.data.offers);
      setInboxCount(result.data.totalCount);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch inbox';
      setInboxError(message);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  // Listen for outgoing offers
  useEffect(() => {
    if (!user) {
      setHasActiveOffer(false);
      setOutgoingOffer(null);
      return;
    }

    // Query for active outgoing offers from this user
    // We want the most recent active one
    const q = query(
      collection(getFirebaseDb(), 'offers'),
      where('fromUid', '==', user.uid),
      where('status', 'in', ['pending', 'accepted']), // Listen for accepted too so we catch the match
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          console.log('Outgoing offer update:', data.status, data.matchId); // Debug log

          // Check for manual expiration first (client-side check)
          const now = new Date();
          const expiresAtDate = data.expiresAt?.toDate() || new Date(now.getTime() + 15 * 60 * 1000);
          const expiresInSeconds = Math.max(0, Math.floor((expiresAtDate.getTime() - now.getTime()) / 1000));

          if (data.status === 'accepted' || expiresInSeconds > 0) {
            const offer: OutgoingOffer = {
              offerId: doc.id,
              toUid: data.toUid,
              toDisplayName: data.toDisplayName || 'User',
              activity: data.activity,
              status: data.status,
              expiresAt: expiresAtDate.toISOString(),
              expiresInSeconds,
              matchId: data.matchId
            };

            console.log('Setting active outgoing offer:', offer); // Debug log
            setOutgoingOffer(offer);
            setHasActiveOffer(true);
          } else {
            // Expired and not accepted
            setHasActiveOffer(false);
            setOutgoingOffer(null);
          }
        } else {
          setHasActiveOffer(false);
          setOutgoingOffer(null);
        }
        setOutgoingLoading(false);
      },
      (err) => {
        console.error('Outgoing offer listener error:', err);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Fetch outgoing offer - Keeping this for manual refresh but adding listener below
  const fetchOutgoing = useCallback(async () => {
    setOutgoingLoading(true);
    setOutgoingError(null);

    try {
      const result = await offerGetOutgoing();
      setHasActiveOffer(result.data.hasActiveOffer);
      setOutgoingOffer(result.data.offer || null);
      setCooldownRemaining(result.data.cooldownRemaining || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch outgoing offer';
      setOutgoingError(message);
    } finally {
      setOutgoingLoading(false);
    }
  }, []);

  // Create a new offer
  const createOffer = useCallback(async (
    targetUid: string,
    explanation?: string,
    matchScore?: number,
    distanceMeters?: number
  ) => {
    setCreateLoading(true);
    setOutgoingError(null);

    try {
      const result = await offerCreate({
        targetUid,
        explanation,
        matchScore,
        distanceMeters,
      });

      if (result.data.matchCreated) {
        // Immediate match (mutual interest)
        return {
          matchCreated: true,
          matchId: result.data.matchId,
          offerId: result.data.offerId,
        };
      }

      // Offer created, refresh outgoing state
      await fetchOutgoing();

      return {
        matchCreated: false,
        offerId: result.data.offerId,
        expiresAt: result.data.expiresAt,
        cooldownUntil: result.data.cooldownUntil,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create offer';
      setOutgoingError(message);
      throw err;
    } finally {
      setCreateLoading(false);
    }
  }, [fetchOutgoing]);

  // Respond to an inbox offer
  const respondToOffer = useCallback(async (offerId: string, action: 'accept' | 'decline') => {
    setInboxLoading(true);
    setInboxError(null);

    try {
      const result = await offerRespond({ offerId, action });

      // Refresh inbox after responding
      await fetchInbox();

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to respond to offer';
      setInboxError(message);
      throw err;
    } finally {
      setInboxLoading(false);
    }
  }, [fetchInbox]);

  // Cancel outgoing offer
  const cancelOutgoingOffer = useCallback(async (offerId: string) => {
    setOutgoingLoading(true);
    setOutgoingError(null);

    try {
      await offerCancel({ offerId });

      // Clear local state
      setHasActiveOffer(false);
      setOutgoingOffer(null);

      // Refresh to get updated cooldown
      await fetchOutgoing();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel offer';
      setOutgoingError(message);
      throw err;
    } finally {
      setOutgoingLoading(false);
    }
  }, [fetchOutgoing]);

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const timer = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Clear all state
  const clearOffers = useCallback(() => {
    setInboxOffers([]);
    setInboxCount(0);
    setOutgoingOffer(null);
    setHasActiveOffer(false);
    setCooldownRemaining(0);
    setInboxError(null);
    setOutgoingError(null);
  }, []);

  return {
    // Inbox
    inboxOffers,
    inboxCount,
    inboxLoading,
    inboxError,
    fetchInbox,
    respondToOffer,

    // Outgoing
    outgoingOffer,
    hasActiveOffer,
    cooldownRemaining,
    outgoingLoading,
    outgoingError,
    fetchOutgoing,
    cancelOutgoingOffer,

    // Create
    createOffer,
    createLoading,

    // Utils
    clearOffers,
  };
}
