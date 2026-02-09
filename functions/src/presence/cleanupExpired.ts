import * as admin from 'firebase-admin';

/**
 * Scheduled cleanup for expired presence documents.
 *
 * Problem: Presence documents remain in Firestore after expiresAt passes.
 * They are filtered at query time but never cleaned up, causing DB growth.
 *
 * Solution: Delete expired presence documents to maintain operational hygiene.
 *
 * Runs every 5 minutes (same frequency as offer/match cleanup).
 */

const BATCH_SIZE = 100; // Process up to 100 expired presence docs per run

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

  const batch = db.batch();
  let deletedCount = 0;
  let skippedCount = 0;

  expiredPresence.docs.forEach((doc) => {
    const presenceData = doc.data();

    // Double-check expiry (race condition guard)
    if (presenceData.expiresAt && presenceData.expiresAt.toMillis() > now.toMillis()) {
      skippedCount++;
      return;
    }

    // Additional safety: don't delete if status is 'matched' (user in active match)
    if (presenceData.status === 'matched') {
      console.log(`[presenceCleanupExpired] Skipping ${doc.id} - status is 'matched'`);
      skippedCount++;
      return;
    }

    batch.delete(doc.ref);
    deletedCount++;
  });

  if (deletedCount > 0) {
    await batch.commit();
    console.log(`[presenceCleanupExpired] Deleted ${deletedCount} expired presence documents`);
  }

  if (skippedCount > 0) {
    console.log(`[presenceCleanupExpired] Skipped ${skippedCount} documents (race condition or matched status)`);
  }

  console.log('[presenceCleanupExpired] Cleanup complete');
}