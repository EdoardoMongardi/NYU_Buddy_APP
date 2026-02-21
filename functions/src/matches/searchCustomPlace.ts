import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';

interface PlaceCandidate {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    distance: number;
    rank: number;
    tags?: string[];
    priceLevel?: number;
    priceRange?: string;
    photoUrl?: string;
}

interface MatchSearchCustomPlaceData {
    matchId: string;
    customPlace: PlaceCandidate;
}

export async function matchSearchCustomPlaceHandler(
    request: CallableRequest<MatchSearchCustomPlaceData>
) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Require email verification
    await requireEmailVerification(request);

    const uid = request.auth.uid;
    const { matchId, customPlace } = request.data;

    if (!matchId || typeof matchId !== 'string') {
        throw new HttpsError('invalid-argument', 'Match ID is required');
    }

    if (!customPlace || !customPlace.placeId || !customPlace.name) {
        throw new HttpsError('invalid-argument', 'Valid custom place data is required');
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

        // Verify match is in location_deciding status
        if (match.status !== 'location_deciding') {
            throw new HttpsError('failed-precondition', 'Location decision has already ended');
        }

        const placeCandidates: PlaceCandidate[] = match.placeCandidates || [];

        // Check if the place already exists in candidates
        const existingIndex = placeCandidates.findIndex((p) => p.placeId === customPlace.placeId);

        let finalPlaceId = customPlace.placeId;

        if (existingIndex === -1) {
            // Add the new custom place
            placeCandidates.push(customPlace);

            transaction.update(matchRef, {
                placeCandidates,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                [`telemetry.customPlacesAddedByUser.${uid}`]: admin.firestore.FieldValue.increment(1),
            });
        } else {
            // Use the existing one
            finalPlaceId = placeCandidates[existingIndex].placeId;
        }

        return {
            success: true,
            placeId: finalPlaceId
        };
    });
}
