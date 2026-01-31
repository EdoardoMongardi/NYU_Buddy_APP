'use client';

import { useState, useCallback } from 'react';
import { suggestionGetCycle, suggestionPass, offerCreate, CycleSuggestion, CycleInfo } from '@/lib/firebase/functions';

export function useCycleSuggestions() {
    const [suggestion, setSuggestion] = useState<CycleSuggestion | null>(null);
    const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchMessage, setSearchMessage] = useState<string | null>(null);

    // Fetch current suggestion (or start/refresh cycle)
    const fetchSuggestion = useCallback(async (action: 'next' | 'refresh' = 'next') => {
        setLoading(true);
        setError(null);
        setSearchMessage(null);

        try {
            const result = await suggestionGetCycle({ action });
            const data = result.data;

            setSuggestion(data.suggestion);
            setCycleInfo(data.cycleInfo);

            if (!data.suggestion) {
                setSearchMessage(data.message || 'No one nearby right now.');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to get suggestion';
            setError(message);
            setSuggestion(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Pass current suggestion
    const passSuggestion = useCallback(async () => {
        if (!suggestion) return;

        setLoading(true);
        try {
            await suggestionPass({ targetUid: suggestion.uid });
            // Optimistically fetch next
            await fetchSuggestion('next');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to pass';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [suggestion, fetchSuggestion]);

    // Send invite (replaces accept)
    const sendInvite = useCallback(async () => {
        if (!suggestion) return;

        setLoading(true);
        try {
            // Create offer
            const result = await offerCreate({
                targetUid: suggestion.uid,
                explanation: suggestion.explanation,
                // matchScore and distance can be passed if needed
                distanceMeters: suggestion.distance,
            });

            if (result.data.matchCreated) {
                // Return immediately for handling in UI
                return { matchCreated: true, matchId: result.data.matchId };
            }

            // If invite sent, move to next suggestion automatically
            await fetchSuggestion('next');

            return { matchCreated: false, offerId: result.data.offerId };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send invite';
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [suggestion, fetchSuggestion]);

    return {
        suggestion,
        cycleInfo,
        loading,
        error,
        searchMessage,
        fetchSuggestion,
        passSuggestion,
        sendInvite
    };
}
