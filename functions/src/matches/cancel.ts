import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

interface MatchCancelData {
  matchId: string;
  reason?: string;
}

export async function matchCancelHandler(request: CallableRequest<MatchCancelData>) {
  // Wrap everything in try-catch to prevent 500 Internal Server Error
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const uid = request.auth.uid;
    const { matchId, reason } = request.data;
    const db = admin.firestore();

    console.log(`[matchCancel] Starting cancel for match ${matchId} by user ${uid}`);

    // Validate input
    if (!matchId) {
      throw new HttpsError('invalid-argument', 'Match ID is required');
    }

    // Get match
    const matchRef = db.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      console.error(`[matchCancel] Match ${matchId} not found`);
      throw new HttpsError('not-found', 'Match not found');
    }

    const match = matchDoc.data();
    if (!match) {
      console.error(`[matchCancel] Match ${matchId} exists but has no data`);
      throw new HttpsError('internal', 'Match data corrupted');
    }

    // Validate user is participant
    if (match.user1Uid !== uid && match.user2Uid !== uid) {
      console.warn(`[matchCancel] User ${uid} not in match ${matchId} (participants: ${match.user1Uid}, ${match.user2Uid})`);
      throw new HttpsError('permission-denied', 'You are not part of this match');
    }

    // Check match is not already completed or cancelled
    if (match.status === 'completed') {
      throw new HttpsError('failed-precondition', 'Cannot cancel a completed match');
    }

    if (match.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'Match is already cancelled');
    }

    // Determine if other user was already heading/arrived (more severe)
    const otherUid = match.user1Uid === uid ? match.user2Uid : match.user1Uid;
    const otherStatus = match.statusByUser?.[otherUid];
    const wasSevereCancel = ['heading_there', 'arrived'].includes(otherStatus);

    await db.runTransaction(async (transaction) => {
      const uidsToUpdate = [match.user1Uid, match.user2Uid]
        .filter(u => typeof u === 'string' && u.length > 0);
      const presenceRefs = uidsToUpdate.map(u => db.collection('presence').doc(u));
      const userRef = db.collection('users').doc(uid);

      // 1. READS (Must come before any writes)
      const userDoc = await transaction.get(userRef);

      let presenceDocs: admin.firestore.DocumentSnapshot[] = [];
      if (presenceRefs.length > 0) {
        presenceDocs = await transaction.getAll(...presenceRefs);
      }

      // Find associated offers to cancel (prevents infinite redirect loop)
      const offersQuery = db.collection('offers')
        .where('matchId', '==', matchId)
        .where('status', '==', 'accepted');
      const offersSnapshot = await transaction.get(offersQuery);

      // 2. WRITES
      // Update match to cancelled
      transaction.update(matchRef, {
        status: 'cancelled',
        cancelledBy: uid,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancellationReason: reason || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update cancelling user's reliability stats
      if (userDoc.exists) {
        const userData = userDoc.data()!;
        const stats = userData.reliabilityStats || {
          totalMatches: 0,
          metConfirmed: 0,
          cancelledByUser: 0,
          noShow: 0,
          expired: 0,
        };

        stats.cancelledByUser = (stats.cancelledByUser || 0) + 1;
        stats.totalMatches = (stats.totalMatches || 0) + 1;

        // Recalculate reliability score
        const total = stats.totalMatches || 1;
        const rawScore = (
          (stats.metConfirmed || 0) * 1.0 -
          (stats.cancelledByUser || 0) * (wasSevereCancel ? 0.5 : 0.3) -
          (stats.noShow || 0) * 0.5
        ) / total;
        const reliabilityScore = Math.max(0, Math.min(1, 0.5 + rawScore * 0.5));

        transaction.update(userRef, {
          reliabilityStats: stats,
          reliabilityScore,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Update associated offers to cancelled
      offersSnapshot.docs.forEach((doc) => {
        transaction.update(doc.ref, {
          status: 'cancelled',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      // Update presence docs
      for (const presenceDoc of presenceDocs) {
        if (!presenceDoc.exists) continue;

        const presence = presenceDoc.data();
        if (!presence) continue;

        const now = admin.firestore.Timestamp.now();
        const expiresAt = presence.expiresAt;

        // Safely check expiration
        const isExpired = !expiresAt ||
          (typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() <= now.toMillis());

        // Only reset if presence hasn't expired
        if (!isExpired) {
          transaction.update(presenceDoc.ref, {
            status: 'available',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });

    console.log(`[matchCancel] Successfully cancelled match ${matchId}`);
    return {
      success: true,
      wasSevereCancel,
    };
  } catch (error) {
    console.error('[matchCancel] CRITICAL ERROR:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', error instanceof Error ? error.message : 'Unknown internal error');
  }
}
