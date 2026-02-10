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
 * All writes (match, presence, offers) are wrapped in a Firestore transaction
 * for atomicity — either all succeed or all fail. Guard release runs as a
 * separate post-transaction step (it uses its own internal transaction).
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
  const matchRef = db.collection('matches').doc(matchId);

  // Run all reads + writes atomically in a single transaction.
  // This mirrors the pattern used in cancel.ts (lines 100-204).
  const { overallStatus, user1Uid, user2Uid } = await db.runTransaction(async (transaction) => {
    // ===== PHASE 1: ALL READS (must come before any writes) =====

    // 1a. Read match document (inside transaction for consistency)
    const matchSnap = await transaction.get(matchRef);

    if (!matchSnap.exists) {
      throw new HttpsError('not-found', 'Match not found');
    }

    const match = matchSnap.data()!;

    // Verify user is part of this match
    if (match.user1Uid !== uid && match.user2Uid !== uid) {
      throw new HttpsError(
        'permission-denied',
        'You are not part of this match'
      );
    }

    // 1b. Conditionally read presence docs (only needed for 'completed' status)
    let presenceDocs: admin.firestore.DocumentSnapshot[] = [];
    if (status === 'completed') {
      const presenceRefs = [match.user1Uid, match.user2Uid]
        .filter((u: string) => typeof u === 'string' && u.length > 0)
        .map((u: string) => db.collection('presence').doc(u));

      if (presenceRefs.length > 0) {
        presenceDocs = await transaction.getAll(...presenceRefs);
      }
    }

    // 1c. Conditionally read accepted offers (only needed for 'completed' status)
    let offersSnapshot: admin.firestore.QuerySnapshot | null = null;
    if (status === 'completed') {
      const offersQuery = db.collection('offers')
        .where('matchId', '==', matchId)
        .where('status', '==', 'accepted');
      offersSnapshot = await transaction.get(offersQuery);
    }

    // ===== PHASE 2: COMPUTE =====

    // Update user's status
    const statusByUser = { ...match.statusByUser, [uid]: status };

    // Determine overall match status
    const user1Status = statusByUser[match.user1Uid];
    const user2Status = statusByUser[match.user2Uid];

    let computedOverallStatus = match.status;

    if (user1Status === 'completed' && user2Status === 'completed') {
      computedOverallStatus = 'completed';
    } else if (user1Status === 'arrived' && user2Status === 'arrived') {
      computedOverallStatus = 'arrived';
    } else if (
      (user1Status === 'heading_there' || user1Status === 'arrived') &&
      (user2Status === 'heading_there' || user2Status === 'arrived')
    ) {
      computedOverallStatus = 'heading_there';
    }

    // ===== PHASE 3: ALL WRITES =====

    // 3a. Update match document
    transaction.update(matchRef, {
      statusByUser,
      status: computedOverallStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3b. Individual completion: restore the completing user's presence immediately
    // so the homepage stops redirecting them back to the match page.
    if (status === 'completed' && computedOverallStatus !== 'completed') {
      const myPresenceDoc = presenceDocs.find(
        (doc) => doc.ref.id === uid
      );

      if (myPresenceDoc && myPresenceDoc.exists) {
        const presence = myPresenceDoc.data()!;

        // Safety: skip if presence is no longer for this match
        if ((!presence.matchId || presence.matchId === matchId) && presence.status === 'matched') {
          const now = admin.firestore.Timestamp.now();
          const originalExpiresAt = presence.originalExpiresAt || presence.expiresAt;
          const isOriginalExpired = !originalExpiresAt ||
            (typeof originalExpiresAt.toMillis === 'function' && originalExpiresAt.toMillis() <= now.toMillis());

          if (isOriginalExpired) {
            transaction.delete(myPresenceDoc.ref);
          } else {
            transaction.update(myPresenceDoc.ref, {
              status: 'available',
              matchId: admin.firestore.FieldValue.delete(),
              expiresAt: originalExpiresAt,
              originalExpiresAt: admin.firestore.FieldValue.delete(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          console.log(`[updateMatchStatus] Restored presence for individually completed user ${uid} in match ${matchId}`);
        }
      }
    }

    // 3c. Overall completion: restore both users' presences
    if (computedOverallStatus === 'completed') {
      for (const presenceDoc of presenceDocs) {
        if (!presenceDoc.exists) continue;

        const presence = presenceDoc.data()!;

        // Safety: skip if presence is no longer for this match
        if (presence.matchId && presence.matchId !== matchId) continue;
        if (presence.status !== 'matched') continue;

        const now = admin.firestore.Timestamp.now();
        const originalExpiresAt = presence.originalExpiresAt || presence.expiresAt;
        const isOriginalExpired = !originalExpiresAt ||
          (typeof originalExpiresAt.toMillis === 'function' && originalExpiresAt.toMillis() <= now.toMillis());

        if (isOriginalExpired) {
          transaction.delete(presenceDoc.ref);
        } else {
          transaction.update(presenceDoc.ref, {
            status: 'available',
            matchId: admin.firestore.FieldValue.delete(),
            expiresAt: originalExpiresAt,
            originalExpiresAt: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      console.log(`[updateMatchStatus] Restored presence for completed match ${matchId}`);
    }

    // 3d. Clean up accepted offers for this match to prevent homepage redirect loop.
    if (status === 'completed' && offersSnapshot && !offersSnapshot.empty) {
      offersSnapshot.docs.forEach((doc) => {
        transaction.update(doc.ref, {
          status: 'completed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(`[updateMatchStatus] Updated ${offersSnapshot.size} offer(s) to completed for match ${matchId}`);
    }

    // Return values needed for post-transaction steps
    return {
      overallStatus: computedOverallStatus,
      user1Uid: match.user1Uid as string,
      user2Uid: match.user2Uid as string,
    };
  });

  // POST-TRANSACTION: Release the pair guard when match completes.
  // This runs outside the transaction because releaseMatchGuard() uses its
  // own internal transaction — Firestore does not support nested transactions.
  // Same pattern as cancel.ts (lines 206-213).
  if (overallStatus === 'completed') {
    try {
      await releaseMatchGuard(matchId, user1Uid, user2Uid);
      console.log(`[updateMatchStatus] Released guard for completed match ${matchId}`);
    } catch (guardError) {
      // Log but don't fail the completion if guard release fails
      console.error(`[updateMatchStatus] Failed to release guard for match ${matchId}:`, guardError);
    }
  }

  return { success: true };
}