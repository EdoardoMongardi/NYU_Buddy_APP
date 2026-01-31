import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

interface OutgoingOffer {
  offerId: string;
  toUid: string;
  toDisplayName: string;
  toPhotoURL: string | null;
  activity: string;
  status: string;
  expiresAt: string;
  expiresInSeconds: number;
  matchId?: string;
}

/**
 * Get all active outgoing offers for current user
 * Updated for multi-offer support (max 3 active offers)
 */
export async function offerGetOutgoingHandler(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  // Check user has active presence
  const presenceDoc = await db.collection('presence').doc(uid).get();
  if (!presenceDoc.exists) {
    return {
      offers: [],
      cooldownRemaining: 0,
      maxOffers: 3,
      canSendMore: true,
    };
  }

  const presence = presenceDoc.data()!;

  // Check cooldown
  let cooldownRemaining = 0;
  if (presence.offerCooldownUntil &&
    presence.offerCooldownUntil.toMillis() > now.toMillis()) {
    cooldownRemaining = Math.ceil((presence.offerCooldownUntil.toMillis() - now.toMillis()) / 1000);
  }

  // Get all pending offers from this user
  const offersQuery = await db.collection('offers')
    .where('fromUid', '==', uid)
    .where('status', '==', 'pending')
    .where('expiresAt', '>', now)
    .orderBy('expiresAt', 'asc')
    .get();

  if (offersQuery.empty) {
    // Clean up stale array if needed
    if (presence.activeOutgoingOfferIds?.length > 0) {
      await presenceDoc.ref.update({
        activeOutgoingOfferIds: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return {
      offers: [],
      cooldownRemaining,
      maxOffers: 3,
      canSendMore: true,
    };
  }

  // Get receiver details for each offer
  const receiverUids = offersQuery.docs.map(doc => doc.data().toUid);
  const receiverDocs = await Promise.all(
    receiverUids.map(toUid => db.collection('users').doc(toUid).get())
  );

  const offers: OutgoingOffer[] = offersQuery.docs.map((offerDoc, index) => {
    const offer = offerDoc.data();
    const receiverData = receiverDocs[index].exists ? receiverDocs[index].data()! : {};

    return {
      offerId: offerDoc.id,
      toUid: offer.toUid,
      toDisplayName: receiverData.displayName || 'NYU Student',
      toPhotoURL: receiverData.photoURL || null,
      activity: offer.activity,
      status: offer.status,
      expiresAt: offer.expiresAt.toDate().toISOString(),
      expiresInSeconds: Math.max(0, Math.floor((offer.expiresAt.toMillis() - now.toMillis()) / 1000)),
      matchId: offer.matchId,
    };
  });

  // Sync presence array with actual offers
  const activeOfferIds = offers.map(o => o.offerId);
  const presenceOfferIds: string[] = presence.activeOutgoingOfferIds || [];

  if (JSON.stringify(activeOfferIds.sort()) !== JSON.stringify(presenceOfferIds.sort())) {
    await presenceDoc.ref.update({
      activeOutgoingOfferIds: activeOfferIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return {
    offers,
    cooldownRemaining,
    maxOffers: 3,
    canSendMore: offers.length < 3,
  };
}
