'use client';

import { useState, useCallback, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
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
  const [outgoingOffers, setOutgoingOffers] = useState<OutgoingOffer[]>([]);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [maxOffers, setMaxOffers] = useState(3);
  const [canSendMore, setCanSendMore] = useState(true);
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
      setOutgoingOffers([]);
      return;
    }

    // Query for active outgoing offers from this user
    const q = query(
      collection(getFirebaseDb(), 'offers'),
      where('fromUid', '==', user.uid),
      where('status', 'in', ['pending', 'accepted']),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const activeOffers: OutgoingOffer[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          // Check for manual expiration first (client-side check)
          const now = new Date();
          const expiresAtDate = data.expiresAt?.toDate() || new Date(now.getTime() + 15 * 60 * 1000);
          const expiresInSeconds = Math.max(0, Math.floor((expiresAtDate.getTime() - now.getTime()) / 1000));

          if (data.status === 'accepted' || expiresInSeconds > 0) {
            activeOffers.push({
              offerId: doc.id,
              toUid: data.toUid,
              toDisplayName: data.toDisplayName || 'User', // May need to fetch if not denormalized
              toPhotoURL: data.toPhotoURL || null,
              activity: data.activity,
              status: data.status,
              expiresAt: expiresAtDate.toISOString(),
              expiresInSeconds,
              matchId: data.matchId
            });
          }
        });

        // Filter out accepted ones if we want to show match overlay instead?
        // For now, keep them so UI can animate success
        setOutgoingOffers(activeOffers);
        setCanSendMore(activeOffers.filter(o => o.status === 'pending').length < maxOffers);
        setOutgoingLoading(false);
      },
      (err) => {
        console.error('Outgoing offer listener error:', err);
      }
    );

    return () => unsubscribe();
  }, [user, maxOffers]);

  // Fetch outgoing offers (manual refresh)
  const fetchOutgoing = useCallback(async () => {
    setOutgoingLoading(true);
    setOutgoingError(null);

    try {
      const result = await offerGetOutgoing();
      setOutgoingOffers(result.data.offers);
      setCooldownRemaining(result.data.cooldownRemaining || 0);
      setMaxOffers(result.data.maxOffers || 3);
      setCanSendMore(result.data.canSendMore);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch outgoing offers';
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
        return {
          matchCreated: true,
          matchId: result.data.matchId,
          offerId: result.data.offerId,
        };
      }

      // Offer created, refresh outgoing state to get cooldown
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

      // Optimistic update
      setOutgoingOffers(prev => prev.filter(o => o.offerId !== offerId));

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
    setOutgoingOffers([]);
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
    outgoingOffers,
    maxOffers,
    canSendMore,
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
