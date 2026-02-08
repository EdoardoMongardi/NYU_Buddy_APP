import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getPlaceCandidates } from '../utils/places';
import { ACTIVE_MATCH_STATUSES } from '../constants/state';

const OFFER_TTL_MINUTES = 10;
const COOLDOWN_SECONDS = 5; // Reduced for multi-offer
const MAX_ACTIVE_OFFERS = 3;

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

  // Check for max active offers (now supports up to 3)

  // Check if already sent offer to this target
  const existingOfferToTarget = await db.collection('offers')
    .where('fromUid', '==', fromUid)
    .where('toUid', '==', targetUid)
    .where('status', '==', 'pending')
    .where('expiresAt', '>', now)
    .limit(1)
    .get();

  if (!existingOfferToTarget.empty) {
    throw new HttpsError('already-exists', 'You already have an offer pending to this user');
  }

  // Count current active offers (filter out expired ones)
  const activeOffersQuery = await db.collection('offers')
    .where('fromUid', '==', fromUid)
    .where('status', '==', 'pending')
    .where('expiresAt', '>', now)
    .get();

  if (activeOffersQuery.size >= MAX_ACTIVE_OFFERS) {
    throw new HttpsError('resource-exhausted', `Maximum ${MAX_ACTIVE_OFFERS} active offers allowed`);
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
  // Optimized Query: Check specifically for fromUid and targetUid
  const activeStatuses = ACTIVE_MATCH_STATUSES;

  const fromMatchesQuery = await db.collection('matches')
    .where('user1Uid', '==', fromUid)
    .where('status', 'in', activeStatuses)
    .limit(1)
    .get();

  const fromMatchesQuery2 = await db.collection('matches')
    .where('user2Uid', '==', fromUid)
    .where('status', 'in', activeStatuses)
    .limit(1)
    .get();

  if (!fromMatchesQuery.empty || !fromMatchesQuery2.empty) {
    throw new HttpsError('failed-precondition', 'You are already in an active match');
  }

  const toMatchesQuery = await db.collection('matches')
    .where('user1Uid', '==', targetUid)
    .where('status', 'in', activeStatuses)
    .limit(1)
    .get();

  const toMatchesQuery2 = await db.collection('matches')
    .where('user2Uid', '==', targetUid)
    .where('status', 'in', activeStatuses)
    .limit(1)
    .get();

  if (!toMatchesQuery.empty || !toMatchesQuery2.empty) {
    throw new HttpsError('failed-precondition', 'This person is already in an active match');
  }

  // Check if target has pending offer to sender (mutual interest)
  const reverseOfferQuery = await db.collection('offers')
    .where('fromUid', '==', targetUid)
    .where('toUid', '==', fromUid)
    .where('status', '==', 'pending')
    .get();

  if (!reverseOfferQuery.empty) {
    // Mutual interest detected! Validate activities still match before auto-matching
    const reverseOffer = reverseOfferQuery.docs[0];
    const reverseOfferData = reverseOffer.data();

    // U14 Fix: Validate activities match before creating mutual match
    // If activities no longer align, fall through to normal offer creation
    if (fromPresence.activity !== reverseOfferData.activity) {
      console.log(
        `[offerCreate] Activities mismatched in mutual interest: ` +
        `${fromPresence.activity} (current) vs ${reverseOfferData.activity} (offer). ` +
        `Creating normal offer instead.`
      );
      // Fall through to normal offer creation below (no match created)
    } else {
      // Activities match - proceed with mutual match creation
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
          activity: reverseOfferData.activity, // U14 Fix: Use activity from the offer (not current presence)
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
        matchId: matchRef.id,
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update target's presence (User A) - clear offers
      transaction.update(db.collection('presence').doc(targetUid), {
        activeOutgoingOfferIds: [],
        activeOutgoingOfferId: null, // Legacy cleanup
        status: 'matched',
        matchId: matchRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

        // Update sender's presence (User B) - clear offers
        transaction.update(fromPresenceDoc.ref, {
          activeOutgoingOfferIds: [],
          status: 'matched',
          matchId: matchRef.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      // Cleanup other pending offers (Post-transaction)
      // We don't await this to return faster, or we await to ensure consistency?
      // Safer to await to ensure user state is clean.
      await import('./cleanup').then(m => Promise.all([
        m.cleanupPendingOffers(db, fromUid, reverseOffer.id),
        m.cleanupPendingOffers(db, targetUid, reverseOffer.id)
      ]));

      return {
        offerId: reverseOffer.id,
        matchCreated: true,
        matchId: matchRef.id,
      };
    }
    // If activities don't match, fall through to normal offer creation below
  }

  // Get target profile
  const toUserDoc = await db.collection('users').doc(targetUid).get();
  const toUserData = toUserDoc.data() || {};
  const toDisplayName = toUserData.displayName || 'NYU Buddy';
  const toPhotoURL = toUserData.photoURL || null;

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
      toDisplayName,
      toPhotoURL,
      status: 'pending',
      activity: fromPresence.activity,
      fromDurationMinutes: fromPresence.durationMinutes,
      toDurationMinutes: toPresence.durationMinutes,
      distanceMeters: distanceMeters || 0,
      explanation: explanation || '',
      matchScore: matchScore || 0,
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      respondedAt: null,
    });

    // Update sender's presence with active offer (add to array)
    transaction.update(fromPresenceDoc.ref, {
      activeOutgoingOfferIds: admin.firestore.FieldValue.arrayUnion(offerRef.id),
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
