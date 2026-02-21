'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import {
    matchFetchAllPlaces,
    matchSetPlaceChoice,
    matchSearchCustomPlace,
    matchResolvePlaceIfNeeded,
    PlaceCandidate,
} from '@/lib/firebase/functions';
import { useAuth } from './useAuth';

interface PlaceChoice {
    placeId: string;
    placeRank: number;
    chosenAt: Timestamp;
}

interface LocationDecision {
    expiresAt?: Timestamp;
    resolvedAt?: Timestamp;
    resolutionReason?: string;
}

interface MatchDoc {
    id: string;
    user1Uid: string;
    user2Uid: string;
    status: string;
    matchedAt: Timestamp;
    placeCandidates?: PlaceCandidate[];
    placeChoiceByUser?: Record<string, PlaceChoice | null>;
    locationDecision?: LocationDecision;
    confirmedPlaceId?: string;
    confirmedPlaceName?: string;
    confirmedPlaceAddress?: string;
    confirmedPlaceLat?: number;
    confirmedPlaceLng?: number;
}

/**
 * PRD v2.4: Generate windows for "Find Others" rolling logic
 * Always ends at last-three [N-2, N-1, N]
 */
function generateWindows(n: number): number[][] {
    if (n <= 3) return [[0, 1, 2].filter(i => i < n)];
    if (n === 4) return [[0, 1, 2], [0, 1, 3]];
    if (n === 5) return [[0, 1, 2], [0, 3, 4]];

    // n >= 6
    const windows: number[][] = [[0, 1, 2]];
    for (let i = 3; i < n; i += 3) {
        if (i + 2 < n) {
            windows.push([i, i + 1, i + 2]);
        }
    }
    // Ensure last window is [n-3, n-2, n-1]
    const lastWindow = [n - 3, n - 2, n - 1];
    const lastExisting = windows[windows.length - 1];
    if (JSON.stringify(lastExisting) !== JSON.stringify(lastWindow)) {
        windows.push(lastWindow);
    }
    return windows;
}

export function useLocationDecision(matchId: string | null) {
    const { user } = useAuth();
    const [match, setMatch] = useState<MatchDoc | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [windowIndex, setWindowIndex] = useState(0);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [isSettingChoice, setIsSettingChoice] = useState(false);
    const [isResolving, setIsResolving] = useState(false);

    // Trigger resolution (Defined early to be used in useEffect)
    const triggerResolution = useCallback(async () => {
        if (!matchId || isResolving) return;
        setIsResolving(true);

        try {
            await matchResolvePlaceIfNeeded({ matchId });
        } catch (err) {
            console.error('Failed to resolve place:', err);
        } finally {
            setIsResolving(false);
        }
    }, [matchId, isResolving]);

    // Subscribe to match document
    useEffect(() => {
        if (!matchId || !user) {
            setLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(
            doc(getFirebaseDb(), 'matches', matchId),
            (snap) => {
                if (snap.exists()) {
                    setMatch({ id: snap.id, ...snap.data() } as MatchDoc);
                } else {
                    setMatch(null);
                    setError('Match not found');
                }
                setLoading(false);
            },
            (err) => {
                console.error('Match listener error:', err);
                setError('Failed to load match');
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [matchId, user]);

    // Fetch candidates on mount if not already fetched
    useEffect(() => {
        if (!matchId || !match || match.placeCandidates?.length) return;
        if (match.status !== 'location_deciding' && match.status !== 'pending') return;

        matchFetchAllPlaces({ matchId }).catch(console.error);
    }, [matchId, match]);

    // Countdown timer
    useEffect(() => {
        if (!match?.locationDecision?.expiresAt) {
            setCountdown(null);
            return;
        }

        const expiresAt = match.locationDecision.expiresAt.toMillis();

        const updateCountdown = () => {
            const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
            setCountdown(remaining);

            // If countdown reaches 0, trigger resolution
            if (remaining === 0 && match.status === 'location_deciding') {
                triggerResolution();
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, [match?.locationDecision?.expiresAt, match?.status, triggerResolution]);

    // Derived state
    const placeCandidates = useMemo(() => match?.placeCandidates || [], [match?.placeCandidates]);
    const windows = useMemo(() => generateWindows(placeCandidates.length), [placeCandidates.length]);
    const currentWindow = windows[windowIndex] || [];
    const visibleCandidates = currentWindow.map(i => placeCandidates[i]).filter(Boolean);

    const myUid = user?.uid || '';
    const otherUid = match ? (match.user1Uid === myUid ? match.user2Uid : match.user1Uid) : '';

    const myChoice = match?.placeChoiceByUser?.[myUid] || null;
    const otherChoice = match?.placeChoiceByUser?.[otherUid] || null;

    const isConfirmed = Boolean(match?.confirmedPlaceId);
    const bothChoseSame = myChoice && otherChoice && myChoice.placeId === otherChoice.placeId;

    // Find Others - cycle through windows
    const handleFindOthers = useCallback(async () => {
        if (!matchId) return;
        setWindowIndex((prev) => (prev + 1) % windows.length);

        // Track telemetry
        try {
            await matchSetPlaceChoice({
                matchId,
                placeId: '',
                placeRank: 0,
                action: 'findOthers',
            });
        } catch (err) {
            console.error('Failed to track findOthers:', err);
        }
    }, [matchId, windows.length]);

    // Set choice
    const handleSetChoice = useCallback(async (placeId: string, placeRank: number, isTick = false) => {
        if (!matchId) return;
        setIsSettingChoice(true);

        try {
            const result = await matchSetPlaceChoice({
                matchId,
                placeId,
                placeRank,
                action: isTick ? 'tick' : 'choose',
            });

            // If both chose same, immediately resolve
            if (result.data.shouldResolve || result.data.bothChoseSame) {
                await triggerResolution();
            }
        } catch (err) {
            console.error('Failed to set choice:', err);
            setError('Failed to select place');
        } finally {
            setIsSettingChoice(false);
        }
    }, [matchId, triggerResolution]);

    // "Go with their choice" - tick action
    const handleGoWithTheirChoice = useCallback(async () => {
        if (!otherChoice) return;
        await handleSetChoice(otherChoice.placeId, otherChoice.placeRank, true);
    }, [otherChoice, handleSetChoice]);

    // Custom Place Selection
    const handleSelectCustomPlace = useCallback(async (customPlace: PlaceCandidate) => {
        if (!matchId) return;
        setIsSettingChoice(true);

        try {
            const result = await matchSearchCustomPlace({
                matchId,
                customPlace,
            });

            if (result.data.success) {
                // Now set the choice using the newly created/returned placeId
                await handleSetChoice(result.data.placeId, -1, false);
            } else {
                setError('Failed to process custom place');
            }
        } catch (err) {
            console.error('Failed to select custom place:', err);
            setError('Failed to select custom place');
        } finally {
            setIsSettingChoice(false);
        }
    }, [matchId, handleSetChoice]);

    // Get candidate by placeId
    const getCandidateByPlaceId = useCallback((placeId: string) => {
        return placeCandidates.find(c => c.placeId === placeId);
    }, [placeCandidates]);

    // Format countdown as mm:ss
    const formattedCountdown = countdown !== null
        ? `${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, '0')}`
        : null;

    return {
        match,
        loading,
        error,
        // Candidates & windows
        placeCandidates,
        visibleCandidates,
        windowIndex,
        totalWindows: windows.length,
        canFindOthers: windows.length > 1,
        // Choices
        myChoice,
        otherChoice,
        myChosenCandidate: myChoice ? getCandidateByPlaceId(myChoice.placeId) : null,
        otherChosenCandidate: otherChoice ? getCandidateByPlaceId(otherChoice.placeId) : null,
        // Status
        isConfirmed,
        bothChoseSame,
        countdown,
        formattedCountdown,
        // Actions
        handleFindOthers,
        handleSetChoice,
        handleGoWithTheirChoice,
        handleSelectCustomPlace,
        triggerResolution,
        isSettingChoice,
        isResolving,
        // Helpers
        myUid,
        otherUid,
        getCandidateByPlaceId,
    };
}
