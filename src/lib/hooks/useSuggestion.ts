'use client';

import { useState, useCallback } from 'react';
import { suggestionGetTop1, suggestionRespond, offerCreate } from '@/lib/firebase/functions';

interface Suggestion {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  interests: string[];
  activity: string;
  distance: number;
  durationMinutes?: number;
  explanation?: string;
  score?: number;
}

interface SearchResult {
  suggestion: Suggestion | null;
  searchRadiusKm?: number;
  message?: string;
}

export function useSuggestion() {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noOneAvailable, setNoOneAvailable] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [offerSent, setOfferSent] = useState(false);

  const fetchSuggestion = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoOneAvailable(false);
    setSearchMessage(null);
    setOfferSent(false);

    try {
      const result = await suggestionGetTop1();
      const data = result.data as SearchResult;

      if (data.suggestion) {
        setSuggestion(data.suggestion);
        setNoOneAvailable(false);
      } else {
        setSuggestion(null);
        setNoOneAvailable(true);
        setSearchMessage(data.message || 'No one nearby right now. Try again later.');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to get suggestion';
      setError(message);
      setSuggestion(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const respond = useCallback(
    async (targetUid: string, action: 'pass' | 'accept') => {
      setLoading(true);
      setError(null);

      try {
        if (action === 'pass') {
          // Pass still uses suggestionRespond
          const result = await suggestionRespond({ targetUid, action });
          setSuggestion(null);
          setNoOneAvailable(false);
          return result.data;
        } else {
          // Accept now creates an offer
          const currentSuggestion = suggestion;
          const result = await offerCreate({
            targetUid,
            explanation: currentSuggestion?.explanation,
            matchScore: currentSuggestion?.score,
            distanceMeters: currentSuggestion?.distance,
          });

          if (result.data.matchCreated) {
            // Immediate match (mutual interest)
            setSuggestion(null);
            return {
              matchCreated: true,
              matchId: result.data.matchId,
            };
          } else {
            // Offer sent, waiting for response
            setOfferSent(true);
            setSuggestion(null);
            return {
              matchCreated: false,
              offerId: result.data.offerId,
              offerSent: true,
            };
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to respond';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [suggestion]
  );

  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
    setError(null);
    setNoOneAvailable(false);
    setSearchMessage(null);
    setOfferSent(false);
  }, []);

  return {
    suggestion,
    loading,
    error,
    noOneAvailable,
    searchMessage,
    offerSent,
    fetchSuggestion,
    respond,
    clearSuggestion,
  };
}