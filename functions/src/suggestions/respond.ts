import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

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

  // Mutual accept! Create a match
  const matchRef = db.collection('matches').doc();

  // Order UIDs consistently
  const [user1Uid, user2Uid] =
    uid < targetUid ? [uid, targetUid] : [targetUid, uid];

  await matchRef.set({
    user1Uid,
    user2Uid,
    status: 'pending',
    statusByUser: {
      [user1Uid]: 'pending',
      [user2Uid]: 'pending',
    },
    matchedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Clean up both suggestions
  const batch = db.batch();
  batch.delete(suggestionRef);
  batch.delete(db.collection('suggestions').doc(reverseId));
  await batch.commit();

  return { matchCreated: true, matchId: matchRef.id };
}