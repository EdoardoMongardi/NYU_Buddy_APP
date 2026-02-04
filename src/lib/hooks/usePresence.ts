'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { presenceStart, presenceEnd } from '@/lib/firebase/functions';
import { useAuth } from './useAuth';

interface PresenceData {
  uid: string;
  activity: string;
  durationMin: number;
  lat: number;
  lng: number;
  status: string;
  matchId?: string;
  expiresAt: { toMillis: () => number };
}

export function usePresence() {
  const { user } = useAuth();
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for presence changes
  useEffect(() => {
    if (!user) {
      setPresence(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(getFirebaseDb(), 'presence', user.uid),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data() as PresenceData;
          // Check if expired
          if (data.expiresAt.toMillis() > Date.now()) {
            setPresence(data);
          } else {
            setPresence(null);
          }
        } else {
          setPresence(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Presence listener error:', err);
        setError('Failed to load presence');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const startPresence = useCallback(
    async (activity: string, durationMin: number, lat: number, lng: number) => {
      setError(null);
      try {
        await presenceStart({ activity, durationMin, lat, lng });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to set availability';
        setError(message);
        throw err;
      }
    },
    []
  );

  const endPresence = useCallback(async () => {
    setError(null);
    try {
      await presenceEnd();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to end availability';
      setError(message);
      throw err;
    }
  }, []);

  const timeRemaining = presence
    ? Math.max(0, Math.floor((presence.expiresAt.toMillis() - Date.now()) / 60000))
    : 0;

  return {
    presence,
    loading,
    error,
    startPresence,
    endPresence,
    isAvailable: !!presence && timeRemaining > 0,
    timeRemaining,
  };
}