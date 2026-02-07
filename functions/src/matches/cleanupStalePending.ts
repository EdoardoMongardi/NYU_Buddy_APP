import * as admin from 'firebase-admin';
import { cancelMatchInternal } from './cancel';

/**
 * Phase 2.1-A: Scheduled cleanup for stale pending matches.
 *
 * Problem: Matches can remain in 'pending' status indefinitely if clients never
 * call matchFetchAllPlaces. This traps users in presence.status='matched' and
 * causes DB growth.
 *
 * Solution: Auto-cancel matches that have been pending for longer than the timeout.
 *
 * Runs every 5 minutes.
 * Timeout: 15 minutes (configurable via PENDING_TIMEOUT_MINUTES constant).
 */

// Configuration
const PENDING_TIMEOUT_MINUTES = 15;
const BATCH_SIZE = 50; // Process up to 50 stale matches per run

/**
 * Scheduled handler to clean up stale pending matches.
 * Export this in index.ts as onSchedule.
 */
export async function matchCleanupStalePendingHandler(): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const timeoutThreshold = new admin.firestore.Timestamp(
    now.seconds - (PENDING_TIMEOUT_MINUTES * 60),
    now.nanoseconds
  );

  console.log(`[matchCleanupStalePending] Starting cleanup (timeout: ${PENDING_TIMEOUT_MINUTES} min)`);

  // Query matches that are still pending and older than threshold
  // We'll use matchedAt if available, fallback to createdAt if defined,
  // otherwise skip (edge case for very old data)
  const stalePendingMatches = await db
    .collection('matches')
    .where('status', '==', 'pending')
    .where('matchedAt', '<=', timeoutThreshold)
    .limit(BATCH_SIZE)
    .get();

  if (stalePendingMatches.empty) {
    console.log('[matchCleanupStalePending] No stale pending matches found');
    return;
  }

  console.log(`[matchCleanupStalePending] Found ${stalePendingMatches.size} stale pending matches`);

  let cancelledCount = 0;
  let skippedCount = 0;

  // Cancel each match using the shared cancellation logic
  const cancelPromises = stalePendingMatches.docs.map(async (doc) => {
    const matchData = doc.data();

    // Double-check the match is still pending (avoid race conditions)
    if (matchData.status !== 'pending') {
      console.log(`[matchCleanupStalePending] Skipping ${doc.id} - no longer pending`);
      skippedCount++;
      return;
    }

    try {
      // Use the first user as the "canceller" for system-initiated cancellations
      // skipPermissionCheck allows system to cancel on behalf of users
      await cancelMatchInternal(db, doc.id, {
        cancelledBy: matchData.user1Uid || 'system',
        reason: 'timeout_pending',
        skipPermissionCheck: true,
      });

      cancelledCount++;
      console.log(`[matchCleanupStalePending] Cancelled stale match ${doc.id}`);
    } catch (error) {
      console.error(`[matchCleanupStalePending] Failed to cancel ${doc.id}:`, error);
      skippedCount++;
    }
  });

  await Promise.all(cancelPromises);

  console.log(
    `[matchCleanupStalePending] Completed: ${cancelledCount} cancelled, ${skippedCount} skipped`
  );
}