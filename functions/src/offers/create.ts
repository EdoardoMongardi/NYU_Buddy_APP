import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getPlaceCandidates } from '../utils/places';

const OFFER_TTL_MINUTES = 10;
const COOLDOWN_SECONDS = 45;

interface OfferCreateData {
  targetUid: string;
  explanation?: string;
  matchScore?: number;
  distanceMeters?: number;
  activityType?: string; // For place availability check
}

export async function offerCreateHandler(request: CallableRequest<OfferCreateData>) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const fromUid = request.auth.uid;
  const { targetUid, explanation, matchScore, distanceMeters } = request.data;
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  // Validate target
  if (!targetUid || targetUid === fromUid) {
    throw new HttpsError('invalid-argument', 'Invalid target user');
  }

  // Symmetric blocking: Check if sender blocked target
  const senderBlockedTarget = await db
    .collection('blocks')
    .doc(fromUid)
    .collection('blocked')
    .doc(targetUid)
    .get();

  if (senderBlockedTarget.exists) {
    throw new HttpsError('failed-precondition', 'Cannot send offer to this user');
  }

  // Symmetric blocking: Check if target blocked sender
  const targetBlockedSender = await db
    .collection('blocks')
    .doc(targetUid)
    .collection('blocked')
    .doc(fromUid)
    .get();

  if (targetBlockedSender.exists) {
    throw new HttpsError('failed-precondition', 'This user is not available');
  }

  // Get sender's presence
  const fromPresenceDoc = await db.collection('presence').doc(fromUid).get();
  if (!fromPresenceDoc.exists) {
    throw new HttpsError('failed-precondition', 'You must set your availability first');
  }

  const fromPresence = fromPresenceDoc.data()!;

  // Check if presence expired
  if (fromPresence.expiresAt.toMillis() < now.toMillis()) {
    await fromPresenceDoc.ref.delete();
    throw new HttpsError('failed-precondition', 'Your availability has expired');
  }

  // PRD v2.4: Pre-offer Guard - Check place availability
  // Prevents "dead flows" where no meetup spots exist
  const { activityType } = request.data;
  if (!fromPresence.lat || !fromPresence.lng) {
    throw new HttpsError('failed-precondition', 'Your location is unknown');
  }

  const candidates = await getPlaceCandidates({
    center: [fromPresence.lat, fromPresence.lng],
    activityType: activityType || null,
    hardCap: 1, // We only need to know if > 0 exist
  });

  if (candidates.length === 0) {
    throw new HttpsError('failed-precondition', 'NO_PLACES_AVAILABLE');
  }

  // Check for existing active outgoing offer
  if (fromPresence.activeOutgoingOfferId) {
    throw new HttpsError('failed-precondition', 'You already have an active offer pending');
  }

  // Check cooldown
  if (fromPresence.offerCooldownUntil &&
    fromPresence.offerCooldownUntil.toMillis() > now.toMillis()) {
    const remaining = Math.ceil((fromPresence.offerCooldownUntil.toMillis() - now.toMillis()) / 1000);
    throw new HttpsError('failed-precondition', `Please wait ${remaining} seconds before sending another offer`);
  }

  // Get target's presence
  const toPresenceDoc = await db.collection('presence').doc(targetUid).get();
  if (!toPresenceDoc.exists) {
    throw new HttpsError('failed-precondition', 'This person is no longer available');
  }

  const toPresence = toPresenceDoc.data()!;

  // Check if target's presence expired
  if (toPresence.expiresAt.toMillis() < now.toMillis()) {
    throw new HttpsError('failed-precondition', 'This person is no longer available');
  }

  // Check neither is in an active match
  const fromMatches = await db.collection('matches')
    .where('status', 'in', ['pending', 'place_confirmed', 'heading_there', 'arrived'])
    .get();

  const isFromInMatch = fromMatches.docs.some(doc => {
    const data = doc.data();
    return data.user1Uid === fromUid || data.user2Uid === fromUid;
  });

  if (isFromInMatch) {
    throw new HttpsError('failed-precondition', 'You are already in an active match');
  }

  const isToInMatch = fromMatches.docs.some(doc => {
    const data = doc.data();
    return data.user1Uid === targetUid || data.user2Uid === targetUid;
  });

  if (isToInMatch) {
    throw new HttpsError('failed-precondition', 'This person is already in an active match');
  }

  // Check if target has pending offer to sender (mutual interest)
  const reverseOfferQuery = await db.collection('offers')
    .where('fromUid', '==', targetUid)
    .where('toUid', '==', fromUid)
    .where('status', '==', 'pending')
    .get();

  if (!reverseOfferQuery.empty) {
    // Mutual interest! Accept the reverse offer and create match
    const reverseOffer = reverseOfferQuery.docs[0];

    // Create match
    const matchRef = db.collection('matches').doc();
    const [user1Uid, user2Uid] = fromUid < targetUid
      ? [fromUid, targetUid]
      : [targetUid, fromUid];

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
        offerId: reverseOffer.id,
        activity: fromPresence.activity,
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

      // Update reverse offer to accepted
      transaction.update(reverseOffer.ref, {
        status: 'accepted',
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Clear target's activeOutgoingOfferId
      transaction.update(db.collection('presence').doc(targetUid), {
        activeOutgoingOfferId: null,
        status: 'matched',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update sender's presence
      transaction.update(fromPresenceDoc.ref, {
        status: 'matched',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {
      offerId: reverseOffer.id,
      matchCreated: true,
      matchId: matchRef.id,
    };
  }

  // Calculate offer expiration: min(10 min, sender expires, receiver expires)
  const tenMinFromNow = now.toMillis() + OFFER_TTL_MINUTES * 60 * 1000;
  const expiresAtMillis = Math.min(
    tenMinFromNow,
    fromPresence.expiresAt.toMillis(),
    toPresence.expiresAt.toMillis()
  );
  const expiresAt = admin.firestore.Timestamp.fromMillis(expiresAtMillis);

  // Create offer
  const offerRef = db.collection('offers').doc();
  const cooldownUntil = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + COOLDOWN_SECONDS * 1000
  );

  await db.runTransaction(async (transaction) => {
    // Create offer document
    transaction.set(offerRef, {
      fromUid,
      toUid: targetUid,
      status: 'pending',
      activity: fromPresence.activity,
      fromDurationMinutes: fromPresence.durationMinutes,
      toDurationMinutes: toPresence.durationMinutes,
      distanceMeters: distanceMeters || 0,
      explanation: explanation || '',
      matchScore: matchScore || 0,
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      respondedAt: null,
    });

    // Update sender's presence with active offer and cooldown
    transaction.update(fromPresenceDoc.ref, {
      activeOutgoingOfferId: offerRef.id,
      offerCooldownUntil: cooldownUntil,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Increment target's exposure score (fairness)
    transaction.update(db.collection('presence').doc(targetUid), {
      exposureScore: admin.firestore.FieldValue.increment(1),
      lastExposedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return {
    offerId: offerRef.id,
    matchCreated: false,
    expiresAt: expiresAt.toDate().toISOString(),
    cooldownUntil: cooldownUntil.toDate().toISOString(),
  };
}
