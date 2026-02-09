import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getPlaceCandidates } from '../utils/places';
import { ACTIVE_MATCH_STATUSES } from '../constants/state';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendOfferReceivedNotification, sendMatchCreatedNotification } from '../utils/notifications';
import {
  checkIdempotencyInTransaction,
  markIdempotencyCompleteInTransaction,
} from '../utils/idempotency';
import { createMatchAtomic } from '../matches/createMatchAtomic';

const OFFER_TTL_MINUTES = 10;
const COOLDOWN_SECONDS = 5; // Reduced for multi-offer
const MAX_ACTIVE_OFFERS = 3;

interface OfferCreateData {
  targetUid: string;
  explanation?: string;
  matchScore?: number;
  distanceMeters?: number;
  activityType?: string; // For place availability check
  idempotencyKey?: string; // U23: Optional idempotency key for duplicate prevention
}

export async function offerCreateHandler(request: CallableRequest<OfferCreateData>) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // U21 Fix: Require email verification (zero grace period)
  await requireEmailVerification(request);

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

  // U22 FIX: Check for reverse offer (kept as optimization, but re-validated in TX)
  // This outside-TX query is ONLY for fast-path detection - correctness enforced in TX
  const reverseOfferQuery = await db.collection('offers')
    .where('fromUid', '==', targetUid)
    .where('toUid', '==', fromUid)
    .where('status', '==', 'pending')
    .get();

  if (!reverseOfferQuery.empty) {
    // Mutual interest POSSIBLY detected - validate in transaction
    const reverseOfferDoc = reverseOfferQuery.docs[0];

    console.log(
      `[offerCreate] Potential mutual interest detected (outside-TX). ` +
      `Will re-validate in transaction. Reverse offer: ${reverseOfferDoc.id}`
    );

    // U22 + U23: Transaction with atomic match creation
    const { idempotencyKey } = request.data;
    const mutualMatchResult = await db.runTransaction(async (transaction) => {
      // U23: Check idempotency inside transaction
      const idempotencyCheck = await checkIdempotencyInTransaction(
        transaction,
        fromUid,
        'offerCreate_mutualMatch',
        idempotencyKey
      );

      if (idempotencyCheck.isDuplicate) {
        console.log(`[offerCreate-mutualMatch] Returning cached result for duplicate request`);
        return {
          cached: true,
          offerId: idempotencyCheck.cachedResult!.primaryId,
          matchId: idempotencyCheck.cachedResult!.secondaryIds?.[0],
          matchCreated: idempotencyCheck.cachedResult!.flags?.matchCreated || false,
        };
      }

      // U22: Re-read reverse offer INSIDE transaction to avoid TOCTOU
      const reverseOfferSnap = await transaction.get(reverseOfferDoc.ref);

      if (!reverseOfferSnap.exists) {
        console.log(`[offerCreate-mutualMatch] Reverse offer no longer exists. Aborting mutual match.`);
        throw new HttpsError('aborted', 'Reverse offer no longer available');
      }

      const reverseOfferData = reverseOfferSnap.data()!;

      // Verify offer is still pending (not accepted/cancelled by concurrent request)
      if (reverseOfferData.status !== 'pending') {
        console.log(
          `[offerCreate-mutualMatch] Reverse offer status changed to ${reverseOfferData.status}. ` +
          `Aborting mutual match.`
        );
        throw new HttpsError('aborted', 'Reverse offer was just accepted by someone else');
      }

      // Verify activities still match
      if (fromPresence.activity !== reverseOfferData.activity) {
        console.log(
          `[offerCreate-mutualMatch] Activities mismatched: ` +
          `${fromPresence.activity} vs ${reverseOfferData.activity}. Aborting mutual match.`
        );
        throw new HttpsError('aborted', 'Activities no longer match');
      }

      // U22: Use atomic match creation helper with pair-level guard
      const matchResult = await createMatchAtomic(
        {
          user1Uid: fromUid,
          user2Uid: targetUid,
          activity: reverseOfferData.activity,
          durationMinutes: reverseOfferData.durationMin,
          user1Coords: { lat: fromPresence.lat, lng: fromPresence.lng },
          user2Coords: { lat: toPresence.lat, lng: toPresence.lng },
          triggeringOfferId: reverseOfferDoc.id,
        },
        transaction
      );

      const matchId = matchResult.matchId;

      // Update reverse offer to accepted (createMatchAtomic handles presence updates)
      transaction.update(reverseOfferDoc.ref, {
        status: 'accepted',
        matchId,
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Clear both users' outgoing offers arrays
      transaction.update(db.collection('presence').doc(targetUid), {
        activeOutgoingOfferIds: [],
        activeOutgoingOfferId: null, // Legacy cleanup
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(fromPresenceDoc.ref, {
        activeOutgoingOfferIds: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // U23: Mark idempotency as completed
      await markIdempotencyCompleteInTransaction(
        transaction,
        fromUid,
        'offerCreate_mutualMatch',
        idempotencyKey,
        {
          primaryId: reverseOfferDoc.id,
          secondaryIds: [matchId],
          flags: { matchCreated: matchResult.isNewMatch },
        }
      );

      return {
        cached: false,
        offerId: reverseOfferDoc.id,
        matchId,
        matchCreated: matchResult.isNewMatch,
      };
    });

      // U23: If cached, return immediately
      if (mutualMatchResult.cached) {
        return {
          offerId: mutualMatchResult.offerId,
          matchCreated: mutualMatchResult.matchCreated,
          matchId: mutualMatchResult.matchId,
        };
      }

      // Cleanup other pending offers (Post-transaction)
      // We don't await this to return faster, or we await to ensure consistency?
      // Safer to await to ensure user state is clean.
      await import('./cleanup').then(m => Promise.all([
        m.cleanupPendingOffers(db, fromUid, reverseOfferDoc.id),
        m.cleanupPendingOffers(db, targetUid, reverseOfferDoc.id)
      ]));

      // U16: Send push notifications to both users (mutual match)
      // Fetch user profiles for display names
      const [user1Doc, user2Doc] = await Promise.all([
        db.collection('users').doc(fromUid).get(),
        db.collection('users').doc(targetUid).get(),
      ]);

      const user1DisplayName = user1Doc.data()?.displayName || 'Someone';
      const user2DisplayName = user2Doc.data()?.displayName || 'Someone';

      // Send notifications to both users (fire-and-forget)
      Promise.all([
        sendMatchCreatedNotification(fromUid, user2DisplayName, mutualMatchResult.matchId!),
        sendMatchCreatedNotification(targetUid, user1DisplayName, mutualMatchResult.matchId!),
      ]).catch((err) => {
        console.error('[offerCreate-mutualMatch] Failed to send match notifications:', err);
      });

      return {
        offerId: mutualMatchResult.offerId,
        matchCreated: true,
        matchId: mutualMatchResult.matchId,
      };
  }

  // Get sender profile (for notification)
  const fromUserDoc = await db.collection('users').doc(fromUid).get();
  const fromUserData = fromUserDoc.data() || {};
  const fromDisplayName = fromUserData.displayName || 'Someone';

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

  // U23: Transaction-scoped idempotency for normal offer creation
  const normalOfferResult = await db.runTransaction(async (transaction) => {
    // U23: Check idempotency inside transaction
    const { idempotencyKey } = request.data;
    const idempotencyCheck = await checkIdempotencyInTransaction(
      transaction,
      fromUid,
      'offerCreate',
      idempotencyKey
    );

    if (idempotencyCheck.isDuplicate) {
      console.log(`[offerCreate] Returning cached result for duplicate request`);
      return {
        cached: true,
        offerId: idempotencyCheck.cachedResult!.primaryId,
        matchCreated: false,
      };
    }

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

    // U23: Mark idempotency as completed
    await markIdempotencyCompleteInTransaction(
      transaction,
      fromUid,
      'offerCreate',
      idempotencyKey,
      {
        primaryId: offerRef.id,
        flags: { matchCreated: false },
      }
    );

    return {
      cached: false,
      offerId: offerRef.id,
      matchCreated: false,
    };
  });

  // U23: If cached, return immediately (no notification)
  if (normalOfferResult.cached) {
    return {
      offerId: normalOfferResult.offerId,
      matchCreated: false,
      expiresAt: expiresAt.toDate().toISOString(),
      cooldownUntil: cooldownUntil.toDate().toISOString(),
    };
  }

  // U16: Send push notification to target user
  // Fire-and-forget: Don't block the response on notification delivery
  sendOfferReceivedNotification(targetUid, fromDisplayName, offerRef.id).catch((err) => {
    console.error('[offerCreate] Failed to send offer notification:', err);
  });

  return {
    offerId: offerRef.id,
    matchCreated: false,
    expiresAt: expiresAt.toDate().toISOString(),
    cooldownUntil: cooldownUntil.toDate().toISOString(),
  };
}
