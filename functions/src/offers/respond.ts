import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

interface OfferRespondData {
  offerId: string;
  action: 'accept' | 'decline';
}

export async function offerRespondHandler(request: CallableRequest<OfferRespondData>) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;
  const { offerId, action } = request.data;
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  // Validate input
  if (!offerId) {
    throw new HttpsError('invalid-argument', 'Offer ID is required');
  }

  if (!['accept', 'decline'].includes(action)) {
    throw new HttpsError('invalid-argument', 'Action must be accept or decline');
  }

  // Get offer
  const offerRef = db.collection('offers').doc(offerId);
  const offerDoc = await offerRef.get();

  if (!offerDoc.exists) {
    throw new HttpsError('not-found', 'Offer not found');
  }

  const offer = offerDoc.data()!;

  // Validate user is the recipient
  if (offer.toUid !== uid) {
    throw new HttpsError('permission-denied', 'You cannot respond to this offer');
  }

  // Validate offer is still pending
  if (offer.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This offer is no longer available');
  }

  // Validate offer hasn't expired
  if (offer.expiresAt.toMillis() < now.toMillis()) {
    // Update offer to expired
    await offerRef.update({
      status: 'expired',
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError('failed-precondition', 'This offer has expired');
  }

  // Handle decline
  if (action === 'decline') {
    await db.runTransaction(async (transaction) => {
      // Update offer status
      transaction.update(offerRef, {
        status: 'declined',
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Remove from sender's activeOutgoingOfferIds array
      const senderPresenceRef = db.collection('presence').doc(offer.fromUid);
      transaction.update(senderPresenceRef, {
        activeOutgoingOfferIds: admin.firestore.FieldValue.arrayRemove(offerId),
        // Track for cycle deprioritization
        recentlyExpiredOfferUids: admin.firestore.FieldValue.arrayUnion(uid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create 6h mutual rejection cooldown
      // Both users can't see each other for 6h
      const rejectionId1 = `${uid}_${offer.fromUid}`;
      const rejectionId2 = `${offer.fromUid}_${uid}`;

      transaction.set(db.collection('suggestions').doc(rejectionId1), {
        fromUid: uid,
        toUid: offer.fromUid,
        action: 'reject',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.set(db.collection('suggestions').doc(rejectionId2), {
        fromUid: offer.fromUid,
        toUid: uid,
        action: 'reject',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {
      matchCreated: false,
    };
  }

  // Handle accept - validate both users still valid
  const [fromPresenceDoc, toPresenceDoc] = await Promise.all([
    db.collection('presence').doc(offer.fromUid).get(),
    db.collection('presence').doc(uid).get(),
  ]);

  // Check sender's presence
  if (!fromPresenceDoc.exists) {
    await offerRef.update({
      status: 'expired',
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError('failed-precondition', 'The other person is no longer available');
  }

  const fromPresence = fromPresenceDoc.data()!;
  if (fromPresence.expiresAt.toMillis() < now.toMillis()) {
    await offerRef.update({
      status: 'expired',
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError('failed-precondition', 'The other person is no longer available');
  }

  // Check receiver's presence
  if (!toPresenceDoc.exists) {
    throw new HttpsError('failed-precondition', 'Your availability has expired');
  }

  const toPresence = toPresenceDoc.data()!;
  if (toPresence.expiresAt.toMillis() < now.toMillis()) {
    throw new HttpsError('failed-precondition', 'Your availability has expired');
  }

  // Check neither is in an active match
  const activeMatches = await db.collection('matches')
    .where('status', 'in', ['pending', 'place_confirmed', 'heading_there', 'arrived'])
    .get();

  const isFromInMatch = activeMatches.docs.some(doc => {
    const data = doc.data();
    return data.user1Uid === offer.fromUid || data.user2Uid === offer.fromUid;
  });

  if (isFromInMatch) {
    // First-accept-wins: sender is no longer available
    await offerRef.update({
      status: 'expired',
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      matchCreated: false,
      code: 'NO_LONGER_AVAILABLE',
      message: 'Too late — they just matched with someone else.',
    };
  }

  const isToInMatch = activeMatches.docs.some(doc => {
    const data = doc.data();
    return data.user1Uid === uid || data.user2Uid === uid;
  });

  if (isToInMatch) {
    throw new HttpsError('failed-precondition', 'You are already in an active match');
  }

  // Check activity/duration still compatible
  if (fromPresence.activity !== toPresence.activity) {
    await offerRef.update({
      status: 'expired',
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError('failed-precondition', 'Activities no longer match');
  }

  // Create match
  const matchRef = db.collection('matches').doc();
  const [user1Uid, user2Uid] = offer.fromUid < uid
    ? [offer.fromUid, uid]
    : [uid, offer.fromUid];

  // Get other pending offers to this user before transaction
  const otherOffersSnapshot = await db.collection('offers')
    .where('toUid', '==', uid)
    .where('status', '==', 'pending')
    .get();

  // Get presence docs for other offer senders (to check if they exist)
  const otherSenderUids = otherOffersSnapshot.docs
    .filter(doc => doc.id !== offerId)
    .map(doc => doc.data().fromUid);

  const otherPresenceDocs = await Promise.all(
    otherSenderUids.map(senderUid => db.collection('presence').doc(senderUid).get())
  );

  await db.runTransaction(async (transaction) => {
    // Create match
    transaction.set(matchRef, {
      user1Uid,
      user2Uid,
      status: 'pending',
      statusByUser: {
        [user1Uid]: 'pending',
        [user2Uid]: 'pending',
      },
      offerId,
      activity: offer.activity,
      confirmedPlaceId: null,
      confirmedPlaceName: null,
      confirmedPlaceAddress: null,
      placeConfirmedBy: null,
      placeConfirmedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      matchedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update offer to accepted
    transaction.update(offerRef, {
      status: 'accepted',
      matchId: matchRef.id,
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update sender's presence - clear all outgoing offers
    transaction.update(fromPresenceDoc.ref, {
      activeOutgoingOfferIds: [],
      status: 'matched',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update receiver's presence
    transaction.update(toPresenceDoc.ref, {
      status: 'matched',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Decline all other pending offers to receiver
    otherOffersSnapshot.docs.forEach((otherOffer, index) => {
      if (otherOffer.id !== offerId) {
        transaction.update(otherOffer.ref, {
          status: 'expired',
          respondedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Only update presence if it exists
        const otherPresenceDoc = otherPresenceDocs[index];
        if (otherPresenceDoc && otherPresenceDoc.exists) {
          transaction.update(otherPresenceDoc.ref, {
            activeOutgoingOfferIds: admin.firestore.FieldValue.arrayRemove(otherOffer.id),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });
  });

  return {
    matchCreated: true,
    matchId: matchRef.id,
  };
}
