import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

interface OutgoingOffer {
  offerId: string;
  toUid: string;
  toDisplayName: string;
  activity: string;
  status: string;
  expiresAt: string;
  expiresInSeconds: number;
}

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
      hasActiveOffer: false,
      offer: null,
      cooldownRemaining: 0,
    };
  }

  const presence = presenceDoc.data()!;

  // Check cooldown
  let cooldownRemaining = 0;
  if (presence.offerCooldownUntil &&
      presence.offerCooldownUntil.toMillis() > now.toMillis()) {
    cooldownRemaining = Math.ceil((presence.offerCooldownUntil.toMillis() - now.toMillis()) / 1000);
  }

  // Check for active outgoing offer
  if (!presence.activeOutgoingOfferId) {
    return {
      hasActiveOffer: false,
      offer: null,
      cooldownRemaining,
    };
  }

  // Get the offer
  const offerDoc = await db.collection('offers').doc(presence.activeOutgoingOfferId).get();

  if (!offerDoc.exists) {
    // Clear stale reference
    await presenceDoc.ref.update({
      activeOutgoingOfferId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      hasActiveOffer: false,
      offer: null,
      cooldownRemaining,
    };
  }

  const offer = offerDoc.data()!;

  // Check if offer expired
  if (offer.expiresAt.toMillis() <= now.toMillis() || offer.status !== 'pending') {
    // Clear stale reference
    await presenceDoc.ref.update({
      activeOutgoingOfferId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update offer status if needed
    if (offer.status === 'pending') {
      await offerDoc.ref.update({
        status: 'expired',
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return {
      hasActiveOffer: false,
      offer: null,
      cooldownRemaining,
      lastOfferStatus: offer.status === 'pending' ? 'expired' : offer.status,
    };
  }

  // Get receiver's display name
  const receiverDoc = await db.collection('users').doc(offer.toUid).get();
  const receiverData = receiverDoc.exists ? receiverDoc.data()! : {};

  const outgoingOffer: OutgoingOffer = {
    offerId: offerDoc.id,
    toUid: offer.toUid,
    toDisplayName: receiverData.displayName || 'NYU Student',
    activity: offer.activity,
    status: offer.status,
    expiresAt: offer.expiresAt.toDate().toISOString(),
    expiresInSeconds: Math.max(0, Math.floor((offer.expiresAt.toMillis() - now.toMillis()) / 1000)),
  };

  return {
    hasActiveOffer: true,
    offer: outgoingOffer,
    cooldownRemaining,
  };
}
