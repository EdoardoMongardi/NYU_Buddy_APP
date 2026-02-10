'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from './useAuth';

export interface PendingConfirmation {
  matchId: string;
  otherUid: string;
  otherDisplayName: string;
  otherPhotoURL: string | null;
  activity: string;
}

/**
 * Hook to query matches awaiting "Did you meet?" confirmation from the current user.
 *
 * Uses Firestore array-contains query on pendingConfirmationUids.
 * Real-time listener — auto-updates when user responds (uid removed from array).
 */
export function usePendingConfirmations() {
  const { user } = useAuth();
  const [pendingMatches, setPendingMatches] = useState<PendingConfirmation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPendingMatches([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(getFirebaseDb(), 'matches'),
      where('pendingConfirmationUids', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const matches: PendingConfirmation[] = [];

        for (const matchDoc of snapshot.docs) {
          const data = matchDoc.data();

          // Determine the other user
          const otherUid = data.user1Uid === user.uid ? data.user2Uid : data.user1Uid;

          // Fetch other user's profile
          let otherDisplayName = 'Your Buddy';
          let otherPhotoURL: string | null = null;

          try {
            const userDoc = await getDoc(doc(getFirebaseDb(), 'users', otherUid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              otherDisplayName = userData.displayName || 'Your Buddy';
              otherPhotoURL = userData.photoURL || null;
            }
          } catch {
            // Non-critical — use defaults
          }

          matches.push({
            matchId: matchDoc.id,
            otherUid,
            otherDisplayName,
            otherPhotoURL,
            activity: data.activity || '',
          });
        }

        setPendingMatches(matches);
        setLoading(false);
      },
      (err) => {
        console.error('Pending confirmations listener error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { pendingMatches, loading };
}
