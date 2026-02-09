import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { createMatchAtomic } from '../matches/createMatchAtomic';
import { requireEmailVerification } from '../utils/verifyEmail';

interface SuggestionRespondData {
  targetUid: string;
  action: 'pass' | 'accept';
}

export async function suggestionRespondHandler(
  request: CallableRequest<SuggestionRespondData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // U21: Require email verification
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const { targetUid, action } = request.data;

  if (!targetUid || typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'Target user ID is required');
  }

  if (action !== 'pass' && action !== 'accept') {
    throw new HttpsError(
      'invalid-argument',
      'Action must be "pass" or "accept"'
    );
  }

  if (targetUid === uid) {
    throw new HttpsError('invalid-argument', 'Cannot respond to yourself');
  }

  const db = admin.firestore();

  // Create suggestion document
  const suggestionId = `${uid}_${targetUid}`;
  const suggestionRef = db.collection('suggestions').doc(suggestionId);

  await suggestionRef.set({
    fromUid: uid,
    toUid: targetUid,
    action,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // If action is pass, we're done
  if (action === 'pass') {
    return { matchCreated: false };
  }

  // Check if the other user has also accepted us
  const reverseId = `${targetUid}_${uid}`;
  const reverseDoc = await db.collection('suggestions').doc(reverseId).get();

  if (!reverseDoc.exists || reverseDoc.data()?.action !== 'accept') {
    // No mutual accept yet
    return { matchCreated: false };
  }

  // Mutual accept! Get presence data for both users
  const [user1PresenceDoc, user2PresenceDoc] = await Promise.all([
    db.collection('presence').doc(uid).get(),
    db.collection('presence').doc(targetUid).get(),
  ]);

  // Validate both users still have valid presence
  const now = admin.firestore.Timestamp.now();

  if (!user1PresenceDoc.exists) {
    throw new HttpsError('failed-precondition', 'Your availability has expired');
  }

  if (!user2PresenceDoc.exists) {
    throw new HttpsError('failed-precondition', 'The other person is no longer available');
  }

  const user1Presence = user1PresenceDoc.data()!;
  const user2Presence = user2PresenceDoc.data()!;

  // Check presence hasn't expired
  if (user1Presence.expiresAt?.toMillis() < now.toMillis()) {
    throw new HttpsError('failed-precondition', 'Your availability has expired');
  }

  if (user2Presence.expiresAt?.toMillis() < now.toMillis()) {
    throw new HttpsError('failed-precondition', 'The other person is no longer available');
  }

  // Check activity/duration compatibility
  if (user1Presence.activity !== user2Presence.activity) {
    throw new HttpsError('failed-precondition', 'Activities no longer match');
  }

  // U22: Use createMatchAtomic for race-free match creation
  const matchResult = await db.runTransaction(async (transaction) => {
    // Use atomic match creation with pair-level guard
    const result = await createMatchAtomic(
      {
        user1Uid: uid,
        user2Uid: targetUid,
        activity: user1Presence.activity,
        durationMinutes: user1Presence.durationMin || 30,
        user1Coords: { lat: user1Presence.lat, lng: user1Presence.lng },
        user2Coords: { lat: user2Presence.lat, lng: user2Presence.lng },
      },
      transaction
    );

    // Clean up both suggestions inside transaction
    transaction.delete(suggestionRef);
    transaction.delete(db.collection('suggestions').doc(reverseId));

    return result;
  });

  // Post-match cleanup: Cancel all other pending offers for both users
  await import('../offers/cleanup').then(m => Promise.all([
    m.cleanupPendingOffers(db, uid, undefined),
    m.cleanupPendingOffers(db, targetUid, undefined)
  ]));

  return {
    matchCreated: matchResult.isNewMatch,
    matchId: matchResult.matchId,
    activeMatchId: matchResult.matchId
  };
}