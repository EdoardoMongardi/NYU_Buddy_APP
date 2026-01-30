'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { updateMatchStatus, meetupRecommend } from '@/lib/firebase/functions';
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
  cancelReason?: string;
}

interface Place {
  id: string;
  name: string;
  category: string;
  address: string;
  distance: number;
  lat?: number;
  lng?: number;
}

export function useMatch(matchId: string | null) {
  const { user } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [otherUserProfile, setOtherUserProfile] = useState<{
    displayName: string;
    photoURL?: string | null;
    interests: string[];
  } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
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
      if (!match && !loading) {
        // If match is null and we are not loading match anymore, we are done
      }
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
  }, [match, user]); // Depend on match object


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

  const fetchRecommendations = useCallback(async () => {
    if (!matchId) return;

    try {
      const result = await meetupRecommend({ matchId });
      setPlaces(result.data.places);
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    }
  }, [matchId]);

  const myStatus = match && user ? match.statusByUser[user.uid] : null;

  return {
    match,
    otherUserProfile,
    places,
    loading,
    error,
    updateStatus,
    fetchRecommendations,
    myStatus,
  };
}