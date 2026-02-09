import * as admin from 'firebase-admin';

/**
 * Migration Script: Normalize offer updatedAt field
 *
 * Issue: Offers created before U12 fix don't have updatedAt field
 * Solution: Set updatedAt = createdAt for all offers missing updatedAt
 *
 * Usage: Call this function once via Firebase CLI or admin panel
 * Example: firebase functions:call normalizeOfferUpdatedAt
 */

const BATCH_SIZE = 500;

export async function normalizeOfferUpdatedAtHandler(): Promise<{
  success: boolean;
  processed: number;
  updated: number;
  skipped: number;
}> {
  const db = admin.firestore();

  console.log('[Migration] Starting offer updatedAt normalization...');

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

  while (true) {
    // Query offers without updatedAt field (or query all and check)
    let query = db.collection('offers')
      .orderBy('createdAt')
      .limit(BATCH_SIZE);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log('[Migration] No more offers to process');
      break;
    }

    // Process batch
    const batch = db.batch();
    let batchUpdates = 0;

    for (const doc of snapshot.docs) {
      processed++;
      const data = doc.data();

      // Check if updatedAt is missing
      if (!data.updatedAt && data.createdAt) {
        batch.update(doc.ref, {
          updatedAt: data.createdAt, // Set to same as createdAt
        });
        batchUpdates++;
        updated++;
      } else {
        skipped++;
      }
    }

    // Commit batch if there are updates
    if (batchUpdates > 0) {
      await batch.commit();
      console.log(`[Migration] Batch committed: ${batchUpdates} offers updated`);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];

    console.log(`[Migration] Progress: ${processed} processed, ${updated} updated, ${skipped} skipped`);

    // Safety: break if we've processed too many (adjust as needed)
    if (processed >= 10000) {
      console.log('[Migration] Safety limit reached (10k offers)');
      break;
    }
  }

  console.log('[Migration] Complete!');
  console.log(`[Migration] Final stats: ${processed} processed, ${updated} updated, ${skipped} skipped`);

  return {
    success: true,
    processed,
    updated,
    skipped,
  };
}