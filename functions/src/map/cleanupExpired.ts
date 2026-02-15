import * as admin from 'firebase-admin';

const BATCH_SIZE = 100;

/**
 * Scheduled function: runs every 5 minutes.
 * Deletes expired map status documents.
 */
export async function mapStatusCleanupExpiredHandler() {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const expiredStatuses = await db
    .collection('mapStatus')
    .where('expiresAt', '<=', now)
    .limit(BATCH_SIZE)
    .get();

  if (expiredStatuses.empty) {
    console.log('[CleanupMapStatus] No expired statuses found');
    return;
  }

  const batch = db.batch();
  for (const doc of expiredStatuses.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  console.log(`[CleanupMapStatus] Deleted ${expiredStatuses.size} expired map statuses`);
}
