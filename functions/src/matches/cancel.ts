import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { withIdempotencyLock, MinimalResult } from '../utils/idempotency';

interface MatchCancelData {
  matchId: string;
  reason?: string;
  idempotencyKey?: string; // U23: Optional idempotency key for duplicate prevention
}

interface CancelMatchOptions {
  cancelledBy: string;
  reason?: string;
  skipPermissionCheck?: boolean;
}

/**
 * Internal shared cancellation logic.
 * Can be called by both matchCancelHandler (user-initiated) and scheduled jobs (system-initiated).
 *
 * @param db Firestore instance
 * @param matchId Match document ID
 * @param options Cancellation options
 * @returns Object with success status and severity flag
 */
export async function cancelMatchInternal(
  db: admin.firestore.Firestore,
  matchId: string,
  options: CancelMatchOptions
): Promise<{ success: boolean; wasSevereCancel: boolean }> {
  const { cancelledBy, reason, skipPermissionCheck = false } = options;

  console.log(`[cancelMatchInternal] Cancelling match ${matchId} by ${cancelledBy}, reason: ${reason || 'none'}`);

  // Get match
  const matchRef = db.collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    console.error(`[cancelMatchInternal] Match ${matchId} not found`);
    throw new Error('Match not found');
  }

  const match = matchDoc.data();
  if (!match) {
    console.error(`[cancelMatchInternal] Match ${matchId} exists but has no data`);
    throw new Error('Match data corrupted');
  }

  // Validate user is participant (unless skipPermissionCheck is true for system jobs)
  if (!skipPermissionCheck && match.user1Uid !== cancelledBy && match.user2Uid !== cancelledBy) {
    console.warn(`[cancelMatchInternal] User ${cancelledBy} not in match ${matchId}`);
    throw new Error('User is not part of this match');
  }

  // Check match is not already completed or cancelled
  if (match.status === 'completed') {
    console.warn(`[cancelMatchInternal] Cannot cancel completed match ${matchId}`);
    return { success: false, wasSevereCancel: false };
  }

  if (match.status === 'cancelled') {
    console.warn(`[cancelMatchInternal] Match ${matchId} is already cancelled`);
    return { success: false, wasSevereCancel: false };
  }

  const otherUid = match.user1Uid === cancelledBy ? match.user2Uid : match.user1Uid;
  const otherStatus = match.statusByUser?.[otherUid];
  const wasSevereCancel = ['heading_there', 'arrived'].includes(otherStatus);

  // Calculate penalty multiplier
  let penaltyMultiplier = 0.3; // Default minor penalty

  // 1. No penalty for system reasons, safety, or blocks
  if (reason === 'no_places_available' || reason === 'safety_concern' || reason === 'blocked' ||
      reason === 'timeout_pending' || reason === 'system_cleanup') {
    penaltyMultiplier = 0;
  }
  // 2. No penalty for 15s grace period
  else if (match.matchedAt) {
    const matchedAtMillis = (match.matchedAt as admin.firestore.Timestamp).toMillis();
    const nowMillis = admin.firestore.Timestamp.now().toMillis();
    if (nowMillis - matchedAtMillis < 15000) { // 15 seconds
      penaltyMultiplier = 0;
    }
  }

  // 3. Higher penalty for severe cancels (other user waiting/arrived)
  if (wasSevereCancel && penaltyMultiplier > 0) {
    penaltyMultiplier = 0.5;
  }

  await db.runTransaction(async (transaction) => {
    const uidsToUpdate = [match.user1Uid, match.user2Uid]
      .filter(u => typeof u === 'string' && u.length > 0);
    const presenceRefs = uidsToUpdate.map(u => db.collection('presence').doc(u));
    const userRef = db.collection('users').doc(cancelledBy);

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
      cancelledBy,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      cancellationReason: reason || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update cancelling user's reliability stats (only if not a system cancel)
    if (userDoc.exists && !skipPermissionCheck) {
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
        (stats.cancelledByUser || 0) * penaltyMultiplier -
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
          matchId: admin.firestore.FieldValue.delete(), // U15 Fix: Clear matchId on match termination
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  });

  console.log(`[cancelMatchInternal] Successfully cancelled match ${matchId}`);
  return {
    success: true,
    wasSevereCancel,
  };
}

export async function matchCancelHandler(request: CallableRequest<MatchCancelData>) {
  // Wrap everything in try-catch to prevent 500 Internal Server Error
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // U21 Fix: Require email verification (zero grace period)
    await requireEmailVerification(request);

    const uid = request.auth.uid;
    const { matchId, reason, idempotencyKey } = request.data;
    const db = admin.firestore();

    console.log(`[matchCancel] Starting cancel for match ${matchId} by user ${uid}`);

    // Validate input
    if (!matchId) {
      throw new HttpsError('invalid-argument', 'Match ID is required');
    }

    // U23: Wrap with idempotency lock
    const { result, cached } = await withIdempotencyLock<MinimalResult & { success: boolean; wasSevereCancel: boolean }>(
      uid,
      'matchCancel',
      idempotencyKey,
      async () => {
        // Use the shared internal function
        const cancelResult = await cancelMatchInternal(db, matchId, {
          cancelledBy: uid,
          reason,
          skipPermissionCheck: false,
        });

        // Return minimal result for caching
        return {
          primaryId: matchId,
          flags: {
            success: cancelResult.success,
            wasSevereCancel: cancelResult.wasSevereCancel,
          },
          ...cancelResult, // Include full result for return
        } as MinimalResult & { success: boolean; wasSevereCancel: boolean };
      }
    );

    if (cached) {
      console.log(`[matchCancel] Returning cached result (match already cancelled)`);
    }

    return {
      success: result.success,
      wasSevereCancel: result.wasSevereCancel,
    };
  } catch (error) {
    console.error('[matchCancel] CRITICAL ERROR:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', error instanceof Error ? error.message : 'Unknown internal error');
  }
}
