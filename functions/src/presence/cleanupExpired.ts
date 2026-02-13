import * as admin from 'firebase-admin';
import { cancelMatchInternal } from '../matches/cancel';
import { ACTIVE_MATCH_STATUSES, EXPIRED_PENDING_CONFIRMATION } from '../constants/state';

/**
 * Scheduled cleanup for expired presence documents.
 *
 * Problem: Presence documents remain in Firestore after expiresAt passes.
 * They are filtered at query time but never cleaned up, causing DB growth.
 *
 * Solution: Delete expired presence documents to maintain operational hygiene.
 *
 * U19 Fix: For expired presence docs with status='matched', auto-cancel the
 * abandoned match (system-initiated, zero penalty) before deleting the presence.
 * Uses a two-pass approach to avoid write amplification in the batch:
 *   Pass 1: Normal expired docs → batch delete
 *   Pass 2: Matched expired docs → transition match or cancel, then delete on success
 *
 * "Did you meet?" Enhancement: Instead of always cancelling expired matches,
 * active matches are transitioned to 'expired_pending_confirmation' so users
 * can confirm whether they actually met. Only already-terminal matches are
 * handled via cancelMatchInternal (for backward compat with edge cases).
 *
 * Runs every 5 minutes (same frequency as offer/match cleanup).
 */

const BATCH_SIZE = 100; // Process up to 100 expired presence docs per run

interface MatchedExpiredDoc {
  ref: admin.firestore.DocumentReference;
  uid: string;
  matchId: string;
}

/**
 * Scheduled handler to delete expired presence documents.
 * Export this in index.ts as onSchedule.
 */
export async function presenceCleanupExpiredHandler(): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  console.log('[presenceCleanupExpired] Starting cleanup of expired presence documents');

  // Query presence where expiresAt < now
  const expiredPresence = await db
    .collection('presence')
    .where('expiresAt', '<=', now)
    .limit(BATCH_SIZE)
    .get();

  if (expiredPresence.empty) {
    console.log('[presenceCleanupExpired] No expired presence documents found');
    return;
  }

  console.log(`[presenceCleanupExpired] Found ${expiredPresence.size} expired presence documents`);

  // Two-pass approach: separate normal expired from matched expired
  const batch = db.batch();
  let deletedCount = 0;
  let skippedCount = 0;
  const matchedExpiredDocs: MatchedExpiredDoc[] = [];

  expiredPresence.docs.forEach((doc) => {
    const presenceData = doc.data();

    // Double-check expiry (race condition guard)
    if (presenceData.expiresAt && presenceData.expiresAt.toMillis() > now.toMillis()) {
      skippedCount++;
      return;
    }

    // U19: Collect matched+expired docs for individual processing (Pass 2)
    if (presenceData.status === 'matched' && presenceData.matchId) {
      matchedExpiredDocs.push({
        ref: doc.ref,
        uid: doc.id,
        matchId: presenceData.matchId,
      });
      return;
    }

    // Pass 1: Normal expired docs → batch delete
    batch.delete(doc.ref);
    deletedCount++;
  });

  // Commit Pass 1 batch
  if (deletedCount > 0) {
    await batch.commit();
    console.log(`[presenceCleanupExpired] Deleted ${deletedCount} expired presence documents`);
  }

  // Pass 2: Process matched+expired docs individually
  let matchTransitionedCount = 0;
  let matchAlreadyTerminalCount = 0;
  let matchFailedCount = 0;

  for (const { ref, uid, matchId } of matchedExpiredDocs) {
    try {
      // Read the match document to determine its current state
      const matchRef = db.collection('matches').doc(matchId);
      const matchSnap = await matchRef.get();

      if (!matchSnap.exists) {
        // Match doc doesn't exist — just delete the stale presence
        console.log(`[presenceCleanupExpired] Match ${matchId} not found, deleting stale presence for ${uid}`);
        await ref.delete();
        matchAlreadyTerminalCount++;
        continue;
      }

      const matchData = matchSnap.data()!;
      const matchStatus = matchData.status;

      // If match is already terminal or already pending confirmation, just delete the presence
      if (matchStatus === 'completed' || matchStatus === 'cancelled' || matchStatus === EXPIRED_PENDING_CONFIRMATION) {
        console.log(
          `[presenceCleanupExpired] Match ${matchId} already in terminal/confirmation state (${matchStatus}). ` +
          `Deleting stale presence for ${uid}.`
        );
        await ref.delete();
        matchAlreadyTerminalCount++;
        continue;
      }

      // Match is still active — transition to expired_pending_confirmation
      if (ACTIVE_MATCH_STATUSES.includes(matchStatus as typeof ACTIVE_MATCH_STATUSES[number])) {
        console.log(
          `[presenceCleanupExpired] Transitioning active match ${matchId} (status: ${matchStatus}) ` +
          `to ${EXPIRED_PENDING_CONFIRMATION} for user ${uid}`
        );

        // Determine which users need to confirm (exclude users who already clicked "Complete")
        const statusByUser = matchData.statusByUser || {};
        const allUids = [matchData.user1Uid, matchData.user2Uid].filter(Boolean);
        const pendingConfirmationUids = allUids.filter(
          (u: string) => statusByUser[u] !== 'completed'
        );

        // Transition the match
        await matchRef.update({
          status: EXPIRED_PENDING_CONFIRMATION,
          pendingConfirmationUids,
          meetingConfirmation: {},
          confirmationRequestedAt: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Delete the expired presence doc
        await ref.delete();

        // Clean up accepted offers for this match (prevents stale offers in UI)
        try {
          const offersQuery = db.collection('offers')
            .where('matchId', '==', matchId)
            .where('status', '==', 'accepted');
          const offersSnapshot = await offersQuery.get();

          if (!offersSnapshot.empty) {
            const offerBatch = db.batch();
            offersSnapshot.docs.forEach((offerDoc) => {
              offerBatch.update(offerDoc.ref, {
                status: 'expired',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            });
            await offerBatch.commit();
            console.log(
              `[presenceCleanupExpired] Updated ${offersSnapshot.size} accepted offer(s) to expired for match ${matchId}`
            );
          }
        } catch (offerError) {
          // Non-critical: offers staying 'accepted' won't cause redirects (presence guard protects)
          console.error(
            `[presenceCleanupExpired] Failed to clean up offers for match ${matchId}:`,
            offerError
          );
        }

        matchTransitionedCount++;
        console.log(
          `[presenceCleanupExpired] Transitioned match ${matchId} to ${EXPIRED_PENDING_CONFIRMATION}. ` +
          `Pending confirmation from: [${pendingConfirmationUids.join(', ')}]`
        );
      } else {
        // Unknown status — fall back to cancelMatchInternal for safety
        console.warn(
          `[presenceCleanupExpired] Match ${matchId} has unexpected status "${matchStatus}". ` +
          `Falling back to cancelMatchInternal.`
        );
        await cancelMatchInternal(db, matchId, {
          cancelledBy: 'system',
          reason: 'system_presence_expired',
          skipPermissionCheck: true,
        });
        await ref.delete();
        matchTransitionedCount++;
      }
    } catch (error) {
      // Failed — preserve presence to avoid "match alive but presence gone"
      matchFailedCount++;
      console.error(
        `[presenceCleanupExpired] Failed to process match ${matchId} for ${uid}, preserving presence:`,
        error
      );
    }
  }

  if (skippedCount > 0) {
    console.log(`[presenceCleanupExpired] Skipped ${skippedCount} documents (race condition)`);
  }
  if (matchTransitionedCount > 0) {
    console.log(`[presenceCleanupExpired] Transitioned ${matchTransitionedCount} matches`);
  }
  if (matchAlreadyTerminalCount > 0) {
    console.log(`[presenceCleanupExpired] Cleaned ${matchAlreadyTerminalCount} already-terminal presence docs`);
  }
  if (matchFailedCount > 0) {
    console.log(`[presenceCleanupExpired] Failed to process ${matchFailedCount} matches (preserved presence)`);
  }

  console.log('[presenceCleanupExpired] Cleanup complete');
}
