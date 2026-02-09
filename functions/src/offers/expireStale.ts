import * as admin from 'firebase-admin';

/**
 * Phase 2.1-B: Scheduled cleanup for expired pending offers.
 *
 * Problem: Offers can remain in 'pending' status after expiresAt passes until
 * someone responds. This blocks sender's outgoing offer slots and causes DB growth.
 *
 * Solution: Mark expired pending offers as 'expired' and free up sender's
 * activeOutgoingOfferIds slots.
 *
 * Runs every 5 minutes.
 */

const BATCH_SIZE = 100; // Process up to 100 expired offers per run

/**
 * Scheduled handler to mark expired pending offers as 'expired'.
 * Export this in index.ts as onSchedule.
 */
export async function offerExpireStaleHandler(): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  console.log('[offerExpireStale] Starting cleanup of expired pending offers');

  // Query offers where status == 'pending' AND expiresAt < now
  const expiredOffers = await db
    .collection('offers')
    .where('status', '==', 'pending')
    .where('expiresAt', '<=', now)
    .limit(BATCH_SIZE)
    .get();

  if (expiredOffers.empty) {
    console.log('[offerExpireStale] No expired pending offers found');
    return;
  }

  console.log(`[offerExpireStale] Found ${expiredOffers.size} expired pending offers`);

  let expiredCount = 0;
  let skippedCount = 0;

  // Group offers by fromUid to batch presence updates
  const offersByFromUid = new Map<string, string[]>();

  expiredOffers.docs.forEach((doc) => {
    const offerData = doc.data();

    // Double-check still pending (race condition guard)
    if (offerData.status !== 'pending') {
      skippedCount++;
      return;
    }

    const fromUid = offerData.fromUid;
    if (!offersByFromUid.has(fromUid)) {
      offersByFromUid.set(fromUid, []);
    }
    offersByFromUid.get(fromUid)!.push(doc.id);
  });

  // Process in batches (Firestore batch has max 500 operations)
  const batch = db.batch();
  let operationCount = 0;

  for (const doc of expiredOffers.docs) {
    const offerData = doc.data();

    if (offerData.status !== 'pending') {
      continue; // Already skipped above
    }

    // Mark offer as expired
    batch.update(doc.ref, {
      status: 'expired',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    operationCount++;
    expiredCount++;
  }

  // Update presence docs to remove expired offer IDs from activeOutgoingOfferIds
  for (const [fromUid, offerIds] of offersByFromUid.entries()) {
    const presenceRef = db.collection('presence').doc(fromUid);
    const presenceDoc = await presenceRef.get();

    if (!presenceDoc.exists) {
      console.log(`[offerExpireStale] Presence doc for ${fromUid} not found, skipping presence update`);
      continue;
    }

    const presenceData = presenceDoc.data();
    const currentActiveOfferIds = presenceData?.activeOutgoingOfferIds || [];

    // Remove expired offer IDs from the array
    const updatedActiveOfferIds = currentActiveOfferIds.filter(
      (id: string) => !offerIds.includes(id)
    );

    // Only update if there's a change
    if (updatedActiveOfferIds.length !== currentActiveOfferIds.length) {
      batch.update(presenceRef, {
        activeOutgoingOfferIds: updatedActiveOfferIds,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      operationCount++;
    }
  }

  // Commit batch
  if (operationCount > 0) {
    await batch.commit();
    console.log(`[offerExpireStale] Batch committed: ${operationCount} operations`);
  }

  console.log(
    `[offerExpireStale] Completed: ${expiredCount} expired, ${skippedCount} skipped`
  );
}