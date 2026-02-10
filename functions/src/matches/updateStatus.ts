import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { releaseMatchGuard } from './createMatchAtomic';

interface UpdateMatchStatusData {
  matchId: string;
  status: 'heading_there' | 'arrived' | 'completed';
}

/**
 * Updates a user's status in a match and progresses the overall match status
 * when both users reach the same milestone.
 *
 * U15 Fix: Clears presence.matchId when match reaches 'completed' status.
 */
export async function updateMatchStatusHandler(
  request: CallableRequest<UpdateMatchStatusData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // U21 Fix: Require email verification (zero grace period)
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const { matchId, status } = request.data;

  if (!matchId || typeof matchId !== 'string') {
    throw new HttpsError('invalid-argument', 'Match ID is required');
  }

  const validStatuses = ['heading_there', 'arrived', 'completed'];
  if (!validStatuses.includes(status)) {
    throw new HttpsError('invalid-argument', 'Invalid status');
  }

  const db = admin.firestore();

  // Get match document
  const matchRef = db.collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new HttpsError('not-found', 'Match not found');
  }

  const match = matchDoc.data()!;

  // Verify user is part of this match
  if (match.user1Uid !== uid && match.user2Uid !== uid) {
    throw new HttpsError(
      'permission-denied',
      'You are not part of this match'
    );
  }

  // Update user's status
  const statusByUser = { ...match.statusByUser, [uid]: status };

  // Determine overall match status
  // If both users have the same status, update the match status
  const user1Status = statusByUser[match.user1Uid];
  const user2Status = statusByUser[match.user2Uid];

  let overallStatus = match.status;

  // Progress status based on both users
  if (user1Status === 'completed' && user2Status === 'completed') {
    overallStatus = 'completed';
  } else if (user1Status === 'arrived' && user2Status === 'arrived') {
    overallStatus = 'arrived';
  } else if (
    (user1Status === 'heading_there' || user1Status === 'arrived') &&
    (user2Status === 'heading_there' || user2Status === 'arrived')
  ) {
    overallStatus = 'heading_there';
  }

  // Update match status
  await matchRef.update({
    statusByUser,
    status: overallStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Helper: restore or delete a single user's presence based on originalExpiresAt
  const restorePresence = async (presenceRef: admin.firestore.DocumentReference) => {
    const presenceSnap = await presenceRef.get();
    if (!presenceSnap.exists) return;

    const presence = presenceSnap.data()!;

    // Safety: skip if presence is no longer for this match (user started a new session)
    if (presence.matchId && presence.matchId !== matchId) return;
    if (presence.status !== 'matched') return;

    const now = admin.firestore.Timestamp.now();
    const originalExpiresAt = presence.originalExpiresAt || presence.expiresAt;

    const isOriginalExpired = !originalExpiresAt ||
      (typeof originalExpiresAt.toMillis === 'function' && originalExpiresAt.toMillis() <= now.toMillis());

    if (isOriginalExpired) {
      // Original session expired during the match — delete presence
      await presenceRef.delete();
    } else {
      // Original session still valid — restore to available with original expiresAt
      await presenceRef.update({
        status: 'available',
        matchId: admin.firestore.FieldValue.delete(),
        expiresAt: originalExpiresAt,
        originalExpiresAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  };

  // Individual completion: restore the completing user's presence immediately
  // so the homepage stops redirecting them back to the match page.
  // The other user's presence stays matched until they also complete (or the match is cancelled).
  if (status === 'completed' && overallStatus !== 'completed') {
    const myPresenceRef = db.collection('presence').doc(uid);
    await restorePresence(myPresenceRef);
    console.log(`[updateMatchStatus] Restored presence for individually completed user ${uid} in match ${matchId}`);
  }

  // Overall completion: restore both users' presences + release guard
  if (overallStatus === 'completed') {
    const user1PresenceRef = db.collection('presence').doc(match.user1Uid);
    const user2PresenceRef = db.collection('presence').doc(match.user2Uid);

    await Promise.all([
      restorePresence(user1PresenceRef),
      restorePresence(user2PresenceRef),
    ]);
    console.log(`[updateMatchStatus] Restored presence for completed match ${matchId}`);

    // U22 CRITICAL FIX: Release the pair guard when match completes
    // Without this, the pair can NEVER match again (guard blocks future matches forever)
    try {
      await releaseMatchGuard(matchId, match.user1Uid, match.user2Uid);
      console.log(`[updateMatchStatus] Released guard for completed match ${matchId}`);
    } catch (guardError) {
      // Log but don't fail the completion if guard release fails
      console.error(`[updateMatchStatus] Failed to release guard for match ${matchId}:`, guardError);
    }
  }

  return { success: true };
}