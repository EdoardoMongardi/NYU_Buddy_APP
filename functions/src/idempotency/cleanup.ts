import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';

/**
 * U23: Idempotency Record Cleanup Job
 *
 * Deletes expired idempotency records to prevent unbounded storage growth.
 *
 * Schedule: Every 2 hours
 * Batch Size: 2000 records per run
 * Criteria: expiresAt <= now
 *
 * Design Notes:
 * - Conservative 2-hour TTL gives sufficient retry window
 * - 2000 batch size handles expected 10K ops/day traffic
 * - Cleanup runs 12x/day = 24K capacity/day (2.4x safety margin)
 */

const BATCH_SIZE = 2000;

export const idempotencyCleanup = onSchedule(
  {
    schedule: 'every 2 hours',
    timeZone: 'America/New_York',
    region: 'us-east1',
  },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    console.log('[idempotencyCleanup] Starting cleanup job');

    try {
      // Query expired records
      const expiredSnapshot = await db
        .collection('idempotency')
        .where('expiresAt', '<=', now)
        .limit(BATCH_SIZE)
        .get();

      if (expiredSnapshot.empty) {
        console.log('[idempotencyCleanup] No expired records found');
        return;
      }

      // Delete in batch
      const batch = db.batch();
      let deletedCount = 0;

      expiredSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();

      console.log(`[idempotencyCleanup] Deleted ${deletedCount} expired records`);

      // Warn if approaching batch limit (potential backlog)
      if (deletedCount >= BATCH_SIZE * 0.9) {
        console.warn(
          `[idempotencyCleanup] WARNING: Deleted ${deletedCount}/${BATCH_SIZE} records. ` +
          `Cleanup may be falling behind. Consider increasing batch size or frequency.`
        );
      }

      // onSchedule handlers should return void
    } catch (error) {
      console.error('[idempotencyCleanup] Cleanup job failed:', error);
      throw error;
    }
  }
);