'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { updateMatchStatus } from '@/lib/firebase/functions';
import { useAuth } from './useAuth';

interface Match {
  id: string;
  user1Uid: string;
  user2Uid: string;
  status: string;
  statusByUser: Record<string, string>;
  matchedAt: { toDate: () => Date };
  confirmedPlaceId?: string;
  confirmedPlaceName?: string;
  confirmedPlaceAddress?: string;
  placeConfirmedBy?: string;
  cancelledBy?: string;
  cancelledAt?: { toDate: () => Date };
  // Phase 2.2-C: Backend writes 'cancellationReason', frontend previously expected 'cancelReason'
  // Support both for backward compatibility
  cancelReason?: string;
  cancellationReason?: string;
}

/**
 * Phase 2.2-C: Normalize cancellation reason field.
 * Backend writes 'cancellationReason', but frontend previously expected 'cancelReason'.
 * This helper provides backward-compatible read.
 */
function getCancellationReason(match: Match | null): string | undefined {
  if (!match) return undefined;
  // Prefer cancelReason (legacy), fallback to cancellationReason (current backend field)
  return match.cancelReason ?? match.cancellationReason;
}

export function useMatch(matchId: string | null) {
  const { user } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [otherUserProfile, setOtherUserProfile] = useState<{
    displayName: string;
    photoURL?: string | null;
    interests: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Listen for match document
  useEffect(() => {
    if (!matchId || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribeMatch = onSnapshot(
      doc(getFirebaseDb(), 'matches', matchId),
      (docSnap) => {
        if (docSnap.exists()) {
          setMatch({ id: docSnap.id, ...docSnap.data() } as Match);
          // Don't set loading to false here, wait for user profile
        } else {
          console.log('Match document does not exist');
          setMatch(null);
          setOtherUserProfile(null);
          setError('Match not found');
          setLoading(false);
        }
      },
      (err) => {
        console.error('Match listener error:', err);
        setError('Failed to load match');
        setLoading(false);
      }
    );

    return () => unsubscribeMatch();
  }, [matchId, user]);

  // 2. Listen for other user's profile (dependent on match)
  useEffect(() => {
    if (!match || !user) {
      return;
    }

    const otherUid =
      match.user1Uid === user.uid ? match.user2Uid : match.user1Uid;

    if (!otherUid) {
      setLoading(false);
      return;
    }

    const unsubscribeUser = onSnapshot(
      doc(getFirebaseDb(), 'users', otherUid),
      (snap) => {
        if (snap.exists()) {
          const userData = snap.data();
          setOtherUserProfile({
            displayName: userData.displayName || 'Unknown User',
            photoURL: userData.photoURL || null,
            interests: userData.interests || [],
          });
        } else {
          setOtherUserProfile({
            displayName: 'Unknown User',
            photoURL: null,
            interests: []
          });
        }
        // Crucial: Set loading to false once we have the user data (or failed to get it)
        setLoading(false);
      },
      (err) => {
        console.error('Other user listener error:', err);
        // Don't block the UI if user profile fails, just show what we have
        setLoading(false);
      }
    );

    return () => unsubscribeUser();
  }, [match?.user1Uid, match?.user2Uid, user]); // Depend on specific UIDs, not the whole match object


  const updateStatus = useCallback(
    async (status: 'heading_there' | 'arrived' | 'completed') => {
      if (!matchId) return;

      try {
        await updateMatchStatus({ matchId, status });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to update status';
        setError(message);
        throw err;
      }
    },
    [matchId]
  );

  const myStatus = match && user ? match.statusByUser[user.uid] : null;
  const cancellationReason = getCancellationReason(match);

  return {
    match,
    otherUserProfile,
    loading,
    error,
    updateStatus,
    myStatus,
    cancellationReason, // Phase 2.2-C: Normalized cancellation reason
  };
}