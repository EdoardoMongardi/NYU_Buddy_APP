import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

interface OfferCancelData {
  offerId: string;
}

export async function offerCancelHandler(request: CallableRequest<OfferCancelData>) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;
  const { offerId } = request.data;
  const db = admin.firestore();

  // Validate input
  if (!offerId) {
    throw new HttpsError('invalid-argument', 'Offer ID is required');
  }

  // Get offer
  const offerRef = db.collection('offers').doc(offerId);
  const offerDoc = await offerRef.get();

  if (!offerDoc.exists) {
    throw new HttpsError('not-found', 'Offer not found');
  }

  const offer = offerDoc.data()!;

  // Validate user is the sender
  if (offer.fromUid !== uid) {
    throw new HttpsError('permission-denied', 'You cannot cancel this offer');
  }

  // Validate offer is still pending
  if (offer.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This offer cannot be cancelled');
  }

  // Cancel offer and clear presence
  await db.runTransaction(async (transaction) => {
    // Update offer status
    transaction.update(offerRef, {
      status: 'cancelled',
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Clear sender's activeOutgoingOfferId (but keep cooldown)
    const presenceRef = db.collection('presence').doc(uid);
    transaction.update(presenceRef, {
      activeOutgoingOfferId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return {
    success: true,
  };
}
