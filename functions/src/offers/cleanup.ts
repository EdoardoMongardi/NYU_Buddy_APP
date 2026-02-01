import * as admin from 'firebase-admin';

/**
 * Cancels all pending offers sent BY or TO the user.
 * This should be called when a user enters a match to prevent stale offers
 * from being accepted.
 */
export async function cleanupPendingOffers(
    db: admin.firestore.Firestore,
    uid: string,
    excludeOfferId?: string
) {
    const batch = db.batch();
    const now = admin.firestore.Timestamp.now();
    let count = 0;

    // 1. Cancel outgoing pending offers
    const outgoingOffers = await db.collection('offers')
        .where('fromUid', '==', uid)
        .where('status', '==', 'pending')
        .get();

    outgoingOffers.docs.forEach((doc) => {
        if (excludeOfferId && doc.id === excludeOfferId) return;

        batch.update(doc.ref, {
            status: 'cancelled',
            cancelReason: 'matched_elsewhere',
            updatedAt: now,
        });
        count++;
    });

    // 2. Cancel incoming pending offers
    // (Optional: If I match with A, do I want to reject B's offer? Yes, usually.)
    const incomingOffers = await db.collection('offers')
        .where('toUid', '==', uid)
        .where('status', '==', 'pending')
        .get();

    incomingOffers.docs.forEach((doc) => {
        if (excludeOfferId && doc.id === excludeOfferId) return;

        batch.update(doc.ref, {
            status: 'cancelled',
            cancelReason: 'matched_elsewhere',
            updatedAt: now,
        });
        count++;
    });

    if (count > 0) {
        console.log(`[cleanupPendingOffers] Cancelling ${count} offers for user ${uid}`);
        await batch.commit();
    }
}
