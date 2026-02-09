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

  // U15 Fix: Clear presence.matchId when match is completed (terminal state)
  if (overallStatus === 'completed') {
    const batch = db.batch();

    // Clear matchId for both users' presence documents
    const user1PresenceRef = db.collection('presence').doc(match.user1Uid);
    const user2PresenceRef = db.collection('presence').doc(match.user2Uid);

    batch.update(user1PresenceRef, {
      matchId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(user2PresenceRef, {
      matchId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log(`[updateMatchStatus] Cleared presence.matchId for completed match ${matchId}`);

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