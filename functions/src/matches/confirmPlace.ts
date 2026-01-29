import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

interface ConfirmPlaceData {
  matchId: string;
  placeId: string;
}

export async function matchConfirmPlaceHandler(request: CallableRequest<ConfirmPlaceData>) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;
  const { matchId, placeId } = request.data;
  const db = admin.firestore();

  // Validate input
  if (!matchId || !placeId) {
    throw new HttpsError('invalid-argument', 'Match ID and Place ID are required');
  }

  // Get match
  const matchRef = db.collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new HttpsError('not-found', 'Match not found');
  }

  const match = matchDoc.data()!;

  // Validate user is participant
  if (match.user1Uid !== uid && match.user2Uid !== uid) {
    throw new HttpsError('permission-denied', 'You are not part of this match');
  }

  // Check if place already confirmed
  if (match.confirmedPlaceId) {
    throw new HttpsError('failed-precondition', 'A place has already been confirmed for this match');
  }

  // Check match is in valid state
  if (!['pending', 'place_confirmed'].includes(match.status)) {
    throw new HttpsError('failed-precondition', 'Cannot confirm place at this stage');
  }

  // Get place
  const placeDoc = await db.collection('places').doc(placeId).get();

  if (!placeDoc.exists) {
    throw new HttpsError('not-found', 'Place not found');
  }

  const place = placeDoc.data()!;

  if (!place.active) {
    throw new HttpsError('failed-precondition', 'This place is no longer available');
  }

  // Use transaction to ensure first-confirm-wins
  await db.runTransaction(async (transaction) => {
    const freshMatchDoc = await transaction.get(matchRef);
    const freshMatch = freshMatchDoc.data()!;

    // Double-check no place confirmed (race condition protection)
    if (freshMatch.confirmedPlaceId) {
      throw new HttpsError('failed-precondition', 'A place has already been confirmed');
    }

    // Confirm the place
    transaction.update(matchRef, {
      confirmedPlaceId: placeId,
      confirmedPlaceName: place.name,
      confirmedPlaceAddress: place.address,
      placeConfirmedBy: uid,
      placeConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'place_confirmed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return {
    success: true,
    placeName: place.name,
    placeAddress: place.address,
  };
}
