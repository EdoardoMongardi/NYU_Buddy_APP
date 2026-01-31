/**
 * matchFetchAllPlaces - Fetch place candidates for a match
 * PRD v2.4: Uses shared getPlaceCandidates, handles empty candidates with immediate cancel
 */

import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
    getPlaceCandidates,
    getUserLocation,
    calculateMidpoint,
    DEFAULT_LOCATION,
    LOCATION_DECISION_SECONDS,
    PlaceCandidate,
} from '../utils/places';

interface MatchFetchAllPlacesData {
    matchId: string;
}

export async function matchFetchAllPlacesHandler(
    request: CallableRequest<MatchFetchAllPlacesData>
) {
    try {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const uid = request.auth.uid;
        const { matchId } = request.data;

        if (!matchId || typeof matchId !== 'string') {
            throw new HttpsError('invalid-argument', 'Match ID is required');
        }

        const db = admin.firestore();
        const matchRef = db.collection('matches').doc(matchId);
        const matchDoc = await matchRef.get();

        if (!matchDoc.exists) {
            throw new HttpsError('not-found', 'Match not found');
        }

        const match = matchDoc.data()!;

        // Verify user is part of this match
        if (match.user1Uid !== uid && match.user2Uid !== uid) {
            throw new HttpsError('permission-denied', 'You are not part of this match');
        }

        // If match is already cancelled, return early
        if (match.status === 'cancelled') {
            return {
                success: false,
                placeCandidates: [],
                expiresAt: null,
                alreadyFetched: true,
                cancelled: true,
                cancellationReason: match.cancellationReason || null,
            };
        }

        // Idempotent: If already fetched with candidates, return existing
        if (match.placeCandidates && match.placeCandidates.length > 0) {
            return {
                success: true,
                placeCandidates: match.placeCandidates,
                expiresAt: match.locationDecision?.expiresAt?.toDate?.()?.toISOString() || null,
                alreadyFetched: true,
            };
        }

        // Get both users' locations for midpoint calculation
        const [loc1, loc2] = await Promise.all([
            getUserLocation(match.user1Uid),
            getUserLocation(match.user2Uid),
        ]);

        console.log(`[matchFetchAllPlaces] U1: ${match.user1Uid}, Loc1: ${JSON.stringify(loc1)}`);
        console.log(`[matchFetchAllPlaces] U2: ${match.user2Uid}, Loc2: ${JSON.stringify(loc2)}`);

        // Calculate center point
        let center: [number, number];

        if (loc1 && loc2) {
            center = calculateMidpoint(loc1, loc2);
        } else if (loc1) {
            center = [loc1.lat, loc1.lng];
        } else if (loc2) {
            center = [loc2.lat, loc2.lng];
        } else {
            // Default: NYU Washington Square
            console.log('[matchFetchAllPlaces] Fallback to DEFAULT_LOCATION');
            center = DEFAULT_LOCATION;
        }

        // Fix: Ensure matchActivity is defined before logging
        const matchActivity = match.activity || null;
        console.log(`[matchFetchAllPlaces] Center: ${center}, Activity: ${matchActivity}`);

        // Fetch candidates using shared utility
        const placeCandidates = await getPlaceCandidates({
            center,
            activityType: matchActivity,
        });

        // Calculate expiresAt from matchedAt
        const matchedAt = match.matchedAt as admin.firestore.Timestamp;
        // Verify matchedAt exists
        if (!matchedAt) {
            console.error('[matchFetchAllPlaces] matchedAt is missing from match document!');
            throw new Error('Match data incomplete: matchedAt missing');
        }

        const expiresAtMillis = matchedAt.toMillis() + LOCATION_DECISION_SECONDS * 1000;
        const expiresAt = admin.firestore.Timestamp.fromMillis(expiresAtMillis);

        // CRITICAL: If 0 candidates, cancel immediately (don't make them wait 120s)
        if (placeCandidates.length === 0) {
            console.log(`[matchFetchAllPlaces] No candidates found for match ${matchId}, cancelling immediately`);

            await matchRef.update({
                placeCandidates: [],
                status: 'cancelled',
                cancelledBy: 'system',
                cancellationReason: 'no_places_available',
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                endedAt: admin.firestore.FieldValue.serverTimestamp(),
                locationDecision: {
                    expiresAt,
                    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
                    resolutionReason: 'no_places_available',
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
                success: false,
                placeCandidates: [],
                expiresAt: null,
                alreadyFetched: false,
                cancelled: true,
                cancellationReason: 'no_places_available',
            };
        }

        // Update match with candidates
        await matchRef.update({
            placeCandidates,
            locationDecision: {
                expiresAt,
            },
            statusByUser: match.statusByUser || {
                [match.user1Uid]: 'pending',
                [match.user2Uid]: 'pending',
            },
            status: 'location_deciding',
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[matchFetchAllPlaces] Stored ${placeCandidates.length} candidates for match ${matchId}`);

        return {
            success: true,
            placeCandidates,
            expiresAt: expiresAt.toDate().toISOString(),
            alreadyFetched: false,
        };

    } catch (err: any) {
        console.error('[matchFetchAllPlaces] CRITICAL ERROR:', err);
        return {
            success: false,
            // Safely format error message
            message: `Server Error: ${err instanceof Error ? err.message : String(err)}`,
            placeCandidates: [],
            expiresAt: null,
            alreadyFetched: false,
        };
    }
}

// Re-export PlaceCandidate for convenience
export type { PlaceCandidate };
