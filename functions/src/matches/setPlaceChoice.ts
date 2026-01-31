import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

interface MatchSetPlaceChoiceData {
    matchId: string;
    placeId: string;
    placeRank: number;
    // Telemetry actions
    action?: 'choose' | 'tick' | 'findOthers';
}

export async function matchSetPlaceChoiceHandler(
    request: CallableRequest<MatchSetPlaceChoiceData>
) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const uid = request.auth.uid;
    const { matchId, placeId, placeRank, action = 'choose' } = request.data;

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

        // Verify match is in location_deciding status
        if (match.status !== 'location_deciding') {
            throw new HttpsError('failed-precondition', 'Location decision has already ended');
        }

        // Get other user's UID
        const otherUid = match.user1Uid === uid ? match.user2Uid : match.user1Uid;

        const updates: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Handle telemetry for findOthers action
        if (action === 'findOthers') {
            updates[`telemetry.findOthersClicksByUser.${uid}`] = admin.firestore.FieldValue.increment(1);
            transaction.update(matchRef, updates);
            return { success: true, action: 'findOthers' };
        }

        // Handle tick action (Go with their choice)
        if (action === 'tick') {
            updates[`telemetry.tickUsedByUser.${uid}`] = true;
        }

        // For choose/tick actions, we need placeId and placeRank
        if (!placeId || placeRank === undefined) {
            throw new HttpsError('invalid-argument', 'placeId and placeRank are required');
        }

        // Validate placeId exists in candidates
        const placeCandidates = match.placeCandidates || [];
        const candidateExists = placeCandidates.some((c: { placeId: string }) => c.placeId === placeId);
        if (!candidateExists) {
            throw new HttpsError('invalid-argument', 'Invalid place selection');
        }

        // Check if this is a change from previous choice (for telemetry)
        const currentChoice = match.placeChoiceByUser?.[uid];
        const isChangingChoice = currentChoice && currentChoice.placeId !== placeId;

        // Idempotency: if same choice, don't increment counters
        if (currentChoice && currentChoice.placeId === placeId) {
            return {
                success: true,
                action: 'noChange',
                chosenPlaceId: placeId,
            };
        }

        // Increment choice change counter if changing
        if (isChangingChoice) {
            updates[`telemetry.choiceChangedCountByUser.${uid}`] = admin.firestore.FieldValue.increment(1);
        }

        // Set the choice
        updates[`placeChoiceByUser.${uid}`] = {
            placeId,
            placeRank,
            chosenAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        transaction.update(matchRef, updates);

        // Check if both users have now chosen the same place
        const otherChoice = match.placeChoiceByUser?.[otherUid];
        const bothChoseSame = otherChoice && otherChoice.placeId === placeId;

        return {
            success: true,
            action: isChangingChoice ? 'changed' : 'chosen',
            chosenPlaceId: placeId,
            bothChoseSame,
            shouldResolve: bothChoseSame,
        };
    });
}
