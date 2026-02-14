'use client';

import { useState, useCallback, useRef } from 'react';
import { suggestionGetCycle, suggestionPass, offerCreate, CycleSuggestion, CycleInfo } from '@/lib/firebase/functions';

const BATCH_SIZE = 3;

export function useCycleSuggestions() {
    const [suggestion, setSuggestion] = useState<CycleSuggestion | null>(null);
    const [buffer, setBuffer] = useState<CycleSuggestion[]>([]);
    const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchMessage, setSearchMessage] = useState<string | null>(null);

    // Prevent concurrent fetches
    const isFetchingRef = useRef(false);
    // Track pending pass calls so we can await them before a refetch
    const pendingPassesRef = useRef<Promise<unknown>[]>([]);

    // ── Fetch batch of suggestions ──
    const fetchSuggestion = useCallback(async (action: 'next' | 'refresh' = 'next') => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        setLoading(true);
        setError(null);
        setSearchMessage(null);

        try {
            const result = await suggestionGetCycle({ action, batchSize: BATCH_SIZE });
            const data = result.data;
            const suggestions = data.suggestions || (data.suggestion ? [data.suggestion] : []);

            if (suggestions.length > 0) {
                setSuggestion(suggestions[0]);
                setBuffer(suggestions.slice(1));
            } else {
                setSuggestion(null);
                setBuffer([]);
                setSearchMessage(data.message || 'No one nearby right now.');
            }

            setCycleInfo(data.cycleInfo);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to get suggestion';
            setError(message);
            setSuggestion(null);
            setBuffer([]);
        } finally {
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, []);

    // ── Background refetch to refill buffer ──
    const refetchInBackground = useCallback(async () => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        try {
            // Wait for all pending pass writes before fetching
            // (so backend's seenUids is up to date)
            await Promise.all(pendingPassesRef.current);

            const result = await suggestionGetCycle({ action: 'next', batchSize: BATCH_SIZE });
            const data = result.data;
            const suggestions = data.suggestions || (data.suggestion ? [data.suggestion] : []);

            // Deduplicate: don't add candidates already in buffer or currently showing
            setBuffer(prev => {
                const knownUids = new Set(prev.map(s => s.uid));
                const newOnes = suggestions.filter(s => !knownUids.has(s.uid));
                return [...prev, ...newOnes];
            });

            // Also filter out the current suggestion
            setSuggestion(current => {
                if (current) {
                    setBuffer(prev => prev.filter(s => s.uid !== current.uid));
                }
                return current;
            });

            setCycleInfo(data.cycleInfo);
        } catch {
            // Silent failure for background refetch
        } finally {
            isFetchingRef.current = false;
        }
    }, []);

    // ── Pass current suggestion (INSTANT from buffer) ──
    const passSuggestion = useCallback(async () => {
        if (!suggestion) return;

        const passedUid = suggestion.uid;

        // Fire-and-forget: tell backend this user was seen
        const passPromise = suggestionPass({ targetUid: passedUid }).catch(() => {});
        pendingPassesRef.current.push(passPromise);
        passPromise.finally(() => {
            pendingPassesRef.current = pendingPassesRef.current.filter(p => p !== passPromise);
        });

        if (buffer.length > 0) {
            // ── INSTANT: pop next from buffer ──
            const next = buffer[0];
            const remaining = buffer.slice(1);
            setSuggestion(next);
            setBuffer(remaining);

            // Update cycle counter locally
            setCycleInfo(prev => prev ? { ...prev, current: prev.current + 1 } : null);

            // Prefetch more when buffer is getting low
            if (remaining.length <= 1) {
                refetchInBackground();
            }
        } else {
            // ── Buffer empty: must wait for network ──
            setLoading(true);
            try {
                // Ensure all pending passes have completed
                await Promise.all(pendingPassesRef.current);

                const result = await suggestionGetCycle({ action: 'next', batchSize: BATCH_SIZE });
                const data = result.data;
                const suggestions = data.suggestions || (data.suggestion ? [data.suggestion] : []);

                if (suggestions.length > 0) {
                    setSuggestion(suggestions[0]);
                    setBuffer(suggestions.slice(1));
                } else {
                    setSuggestion(null);
                    setBuffer([]);
                    setSearchMessage(data.message || 'No one nearby right now.');
                }

                setCycleInfo(data.cycleInfo);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to pass';
                setError(message);
            } finally {
                setLoading(false);
            }
        }
    }, [suggestion, buffer, refetchInBackground]);

    // ── Send invite (replaces accept) ──
    const sendInvite = useCallback(async () => {
        if (!suggestion) return;

        setLoading(true);
        try {
            // Create offer
            const result = await offerCreate({
                targetUid: suggestion.uid,
                explanation: suggestion.explanation,
                distanceMeters: suggestion.distance,
            });

            if (result.matchCreated) {
                // Return immediately for handling in UI
                return { matchCreated: true, matchId: result.matchId };
            }

            // Invite sent — show next from buffer or fetch
            if (buffer.length > 0) {
                const next = buffer[0];
                const remaining = buffer.slice(1);
                setSuggestion(next);
                setBuffer(remaining);
                setCycleInfo(prev => prev ? { ...prev, current: prev.current + 1 } : null);

                if (remaining.length <= 1) {
                    refetchInBackground();
                }
            } else {
                await fetchSuggestion('next');
            }

            return { matchCreated: false, offerId: result.offerId };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send invite';
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [suggestion, buffer, fetchSuggestion, refetchInBackground]);

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
