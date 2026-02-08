import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

interface MatchResolvePlaceData {
    matchId: string;
}

interface PlaceCandidate {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    distance: number;
    rank: number;
}

interface PlaceChoice {
    placeId: string;
    placeRank: number;
    chosenAt: admin.firestore.Timestamp;
    source?: 'tick' | 'choose'; // Track choice provenance (added for tick_sync resolution)
}

type ResolutionReason = 'both_same' | 'tick_sync' | 'one_chose' | 'none_chose' | 'rank_tiebreak';

export async function matchResolvePlaceIfNeededHandler(
    request: CallableRequest<MatchResolvePlaceData>
) {
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

    return await db.runTransaction(async (transaction) => {
        const matchDoc = await transaction.get(matchRef);

        if (!matchDoc.exists) {
            throw new HttpsError('not-found', 'Match not found');
        }

        const match = matchDoc.data()!;

        // Verify user is part of this match
        if (match.user1Uid !== uid && match.user2Uid !== uid) {
            throw new HttpsError('permission-denied', 'You are not part of this match');
        }

        // IDEMPOTENT: If already confirmed, return existing place
        if (match.confirmedPlaceId) {
            return {
                success: true,
                alreadyConfirmed: true,
                confirmedPlaceId: match.confirmedPlaceId,
                confirmedPlaceName: match.confirmedPlaceName,
                confirmedPlaceAddress: match.confirmedPlaceAddress,
                confirmedPlaceLat: match.confirmedPlaceLat,
                confirmedPlaceLng: match.confirmedPlaceLng,
                resolutionReason: match.locationDecision?.resolutionReason,
            };
        }

        // Only resolve if in location_deciding status
        if (match.status !== 'location_deciding') {
            throw new HttpsError('failed-precondition', 'Match is not in location deciding state');
        }

        const placeCandidates: PlaceCandidate[] = match.placeCandidates || [];

        // GUARD: If 0 candidates, cancel with no_places_available
        if (placeCandidates.length === 0) {
            transaction.update(matchRef, {
                status: 'cancelled',
                cancelledBy: 'system',
                cancellationReason: 'no_places_available',
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                endedAt: admin.firestore.FieldValue.serverTimestamp(),
                'locationDecision.resolvedAt': admin.firestore.FieldValue.serverTimestamp(),
                'locationDecision.resolutionReason': 'no_places_available',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
                success: false,
                cancelled: true,
                cancellationReason: 'no_places_available',
            };
        }

        const user1Choice: PlaceChoice | null = match.placeChoiceByUser?.[match.user1Uid] || null;
        const user2Choice: PlaceChoice | null = match.placeChoiceByUser?.[match.user2Uid] || null;

        // Resolve place using PRD v2.4 rules
        const { confirmedPlace, resolutionReason } = resolvePlace(
            placeCandidates,
            user1Choice,
            user2Choice
        );

        // Validate confirmed place has required fields
        if (!confirmedPlace.placeId || !confirmedPlace.name || !confirmedPlace.address ||
            confirmedPlace.lat === undefined || confirmedPlace.lng === undefined) {
            // Fallback to rank #1
            const fallback = placeCandidates[0];
            if (!fallback) {
                throw new HttpsError('internal', 'No valid place to confirm');
            }
            transaction.update(matchRef, {
                confirmedPlaceId: fallback.placeId,
                confirmedPlaceName: fallback.name,
                confirmedPlaceAddress: fallback.address,
                confirmedPlaceLat: fallback.lat,
                confirmedPlaceLng: fallback.lng,
                confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: 'place_confirmed',
                'locationDecision.resolvedAt': admin.firestore.FieldValue.serverTimestamp(),
                'locationDecision.resolutionReason': 'none_chose',
                lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
                success: true,
                alreadyConfirmed: false,
                confirmedPlaceId: fallback.placeId,
                confirmedPlaceName: fallback.name,
                confirmedPlaceAddress: fallback.address,
                confirmedPlaceLat: fallback.lat,
                confirmedPlaceLng: fallback.lng,
                resolutionReason: 'none_chose' as ResolutionReason,
                usedFallback: true,
            };
        }

        // Update match with confirmed place
        transaction.update(matchRef, {
            confirmedPlaceId: confirmedPlace.placeId,
            confirmedPlaceName: confirmedPlace.name,
            confirmedPlaceAddress: confirmedPlace.address,
            confirmedPlaceLat: confirmedPlace.lat,
            confirmedPlaceLng: confirmedPlace.lng,
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'place_confirmed',
            'locationDecision.resolvedAt': admin.firestore.FieldValue.serverTimestamp(),
            'locationDecision.resolutionReason': resolutionReason,
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            alreadyConfirmed: false,
            confirmedPlaceId: confirmedPlace.placeId,
            confirmedPlaceName: confirmedPlace.name,
            confirmedPlaceAddress: confirmedPlace.address,
            confirmedPlaceLat: confirmedPlace.lat,
            confirmedPlaceLng: confirmedPlace.lng,
            resolutionReason,
        };
    });
}

/**
 * PRD v2.4 Resolution Rules (Deterministic):
 * 1. Both chose same → that place
 * 2. Only one chose → their choice
 * 3. Neither chose → Rank #1
 * 4. Both chose different → lower rank wins
 *    If rank equal → lexicographically smaller placeId
 */
function resolvePlace(
    candidates: PlaceCandidate[],
    user1Choice: PlaceChoice | null,
    user2Choice: PlaceChoice | null
): { confirmedPlace: PlaceCandidate; resolutionReason: ResolutionReason } {
    const rank1 = candidates[0]; // Fallback

    // Neither chose
    if (!user1Choice && !user2Choice) {
        return { confirmedPlace: rank1, resolutionReason: 'none_chose' };
    }

    // Only one chose
    if (user1Choice && !user2Choice) {
        const place = candidates.find(c => c.placeId === user1Choice.placeId);
        return { confirmedPlace: place || rank1, resolutionReason: 'one_chose' };
    }

    if (!user1Choice && user2Choice) {
        const place = candidates.find(c => c.placeId === user2Choice.placeId);
        return { confirmedPlace: place || rank1, resolutionReason: 'one_chose' };
    }

    // Both chose - check if same
    if (user1Choice!.placeId === user2Choice!.placeId) {
        const place = candidates.find(c => c.placeId === user1Choice!.placeId);
        // Check if either user used tick action (source provenance)
        const tickUsed = user1Choice!.source === 'tick' || user2Choice!.source === 'tick';
        const reason: ResolutionReason = tickUsed ? 'tick_sync' : 'both_same';
        return { confirmedPlace: place || rank1, resolutionReason: reason };
    }

    // Both chose different - use rank-based tie-breaker
    const place1 = candidates.find(c => c.placeId === user1Choice!.placeId);
    const place2 = candidates.find(c => c.placeId === user2Choice!.placeId);

    if (!place1 && !place2) {
        return { confirmedPlace: rank1, resolutionReason: 'rank_tiebreak' };
    }
    if (!place1) {
        return { confirmedPlace: place2!, resolutionReason: 'rank_tiebreak' };
    }
    if (!place2) {
        return { confirmedPlace: place1, resolutionReason: 'rank_tiebreak' };
    }

    // Compare ranks (lower rank wins)
    if (place1.rank !== place2.rank) {
        const winner = place1.rank < place2.rank ? place1 : place2;
        return { confirmedPlace: winner, resolutionReason: 'rank_tiebreak' };
    }

    // Ranks equal - lexicographically smaller placeId wins
    const winner = place1.placeId < place2.placeId ? place1 : place2;
    return { confirmedPlace: winner, resolutionReason: 'rank_tiebreak' };
}

/**
 * Server-side only function for scheduled expiry resolution
 * Called by matchResolveExpired scheduled job
 */
export async function resolveMatchPlaceInternal(
    db: admin.firestore.Firestore,
    matchId: string
): Promise<void> {
    const matchRef = db.collection('matches').doc(matchId);

    await db.runTransaction(async (transaction) => {
        const matchDoc = await transaction.get(matchRef);

        if (!matchDoc.exists) return;

        const match = matchDoc.data()!;

        // Skip if already confirmed or not in location_deciding
        if (match.confirmedPlaceId || match.status !== 'location_deciding') {
            return;
        }

        const placeCandidates: PlaceCandidate[] = match.placeCandidates || [];

        // GUARD: If 0 candidates, cancel with no_places_available
        if (placeCandidates.length === 0) {
            transaction.update(matchRef, {
                status: 'cancelled',
                cancelledBy: 'system',
                cancellationReason: 'no_places_available',
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                endedAt: admin.firestore.FieldValue.serverTimestamp(),
                'locationDecision.resolvedAt': admin.firestore.FieldValue.serverTimestamp(),
                'locationDecision.resolutionReason': 'no_places_available',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`[resolveMatchPlaceInternal] Match ${matchId} cancelled: no_places_available`);
            return;
        }

        const user1Choice: PlaceChoice | null = match.placeChoiceByUser?.[match.user1Uid] || null;
        const user2Choice: PlaceChoice | null = match.placeChoiceByUser?.[match.user2Uid] || null;

        const { confirmedPlace, resolutionReason } = resolvePlace(
            placeCandidates,
            user1Choice,
            user2Choice
        );

        transaction.update(matchRef, {
            confirmedPlaceId: confirmedPlace.placeId,
            confirmedPlaceName: confirmedPlace.name,
            confirmedPlaceAddress: confirmedPlace.address,
            confirmedPlaceLat: confirmedPlace.lat,
            confirmedPlaceLng: confirmedPlace.lng,
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'place_confirmed',
            'locationDecision.resolvedAt': admin.firestore.FieldValue.serverTimestamp(),
            'locationDecision.resolutionReason': resolutionReason,
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[resolveMatchPlaceInternal] Resolved match ${matchId} with ${resolutionReason}`);
    });
}
