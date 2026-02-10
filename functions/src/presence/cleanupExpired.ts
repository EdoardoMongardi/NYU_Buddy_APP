import * as admin from 'firebase-admin';
import { cancelMatchInternal } from '../matches/cancel';

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
 *   Pass 2: Matched expired docs → individually cancel match, then delete on success
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
  // Cancel the abandoned match first, only delete presence on success
  let matchCancelledCount = 0;
  let matchCancelFailedCount = 0;

  for (const { ref, uid, matchId } of matchedExpiredDocs) {
    try {
      console.log(`[presenceCleanupExpired] Auto-cancelling abandoned match ${matchId} for user ${uid}`);

      await cancelMatchInternal(db, matchId, {
        cancelledBy: 'system',
        reason: 'system_presence_expired',
        skipPermissionCheck: true,
      });

      // Cancel succeeded — now safe to delete the presence doc
      await ref.delete();
      matchCancelledCount++;
      console.log(`[presenceCleanupExpired] Cancelled match ${matchId} and deleted presence for ${uid}`);
    } catch (error) {
      // Cancel failed — preserve presence to avoid "match alive but presence gone"
      matchCancelFailedCount++;
      console.error(
        `[presenceCleanupExpired] Failed to cancel match ${matchId} for ${uid}, preserving presence:`,
        error
      );
    }
  }

  if (skippedCount > 0) {
    console.log(`[presenceCleanupExpired] Skipped ${skippedCount} documents (race condition)`);
  }
  if (matchCancelledCount > 0) {
    console.log(`[presenceCleanupExpired] Auto-cancelled ${matchCancelledCount} abandoned matches`);
  }
  if (matchCancelFailedCount > 0) {
    console.log(`[presenceCleanupExpired] Failed to cancel ${matchCancelFailedCount} matches (preserved presence)`);
  }

  console.log('[presenceCleanupExpired] Cleanup complete');
}
