import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { ACTIVE_MATCH_STATUSES } from '../constants/state';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendMatchCreatedNotification } from '../utils/notifications';
import {
  checkIdempotencyInTransaction,
  markIdempotencyCompleteInTransaction,
} from '../utils/idempotency';

interface OfferRespondData {
  offerId: string;
  action: 'accept' | 'decline';
  idempotencyKey?: string; // U23: Optional idempotency key for duplicate prevention
}

export async function offerRespondHandler(request: CallableRequest<OfferRespondData>) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // U21 Fix: Require email verification (zero grace period)
  await requireEmailVerification(request);

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
    const declineResult = await db.runTransaction(async (transaction) => {
      // U23: Check idempotency for decline action
      const { idempotencyKey } = request.data;
      const idempotencyCheck = await checkIdempotencyInTransaction(
        transaction,
        uid,
        'offerRespond_decline',
        idempotencyKey
      );

      if (idempotencyCheck.isDuplicate) {
        console.log(`[offerRespond-decline] Returning cached result for duplicate request`);
        return { cached: true, matchCreated: false };
      }

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

      // U23: Mark idempotency as completed
      await markIdempotencyCompleteInTransaction(
        transaction,
        uid,
        'offerRespond_decline',
        idempotencyKey,
        {
          primaryId: offerId,
          flags: { matchCreated: false },
        }
      );

      return { cached: false, matchCreated: false };
    });

    return {
      matchCreated: declineResult.matchCreated,
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
  const activeStatuses = ACTIVE_MATCH_STATUSES;

  // Check Sender (fromUid)
  const fromMatchesQuery = await db.collection('matches')
    .where('user1Uid', '==', offer.fromUid)
    .where('status', 'in', activeStatuses)
    .limit(1)
    .get();
  const fromMatchesQuery2 = await db.collection('matches')
    .where('user2Uid', '==', offer.fromUid)
    .where('status', 'in', activeStatuses)
    .limit(1)
    .get();

  if (!fromMatchesQuery.empty || !fromMatchesQuery2.empty) {
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

  // Check Receiver (uid)
  const toMatchesQuery = await db.collection('matches')
    .where('user1Uid', '==', uid)
    .where('status', 'in', activeStatuses)
    .limit(1)
    .get();
  const toMatchesQuery2 = await db.collection('matches')
    .where('user2Uid', '==', uid)
    .where('status', 'in', activeStatuses)
    .limit(1)
    .get();

  if (!toMatchesQuery.empty || !toMatchesQuery2.empty) {
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

  // U23: Transaction-scoped idempotency - all reads/writes in ONE transaction
  const transactionResult = await db.runTransaction(async (transaction) => {
    // U23: Check idempotency inside transaction
    const { idempotencyKey } = request.data;
    const idempotencyCheck = await checkIdempotencyInTransaction(
      transaction,
      uid,
      'offerRespond',
      idempotencyKey
    );

    if (idempotencyCheck.isDuplicate) {
      console.log(`[offerRespond] Returning cached result for duplicate request`);
      // Return cached minimal result - transaction will abort gracefully
      return {
        cached: true,
        matchId: idempotencyCheck.cachedResult!.primaryId,
        offerId: idempotencyCheck.cachedResult!.secondaryIds?.[0],
        matchCreated: idempotencyCheck.cachedResult!.flags?.matchCreated || false,
      };
    }

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
      matchId: matchRef.id, // U14 Fix: Set matchId consistently
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update receiver's presence
    transaction.update(toPresenceDoc.ref, {
      status: 'matched',
      matchId: matchRef.id, // U14 Fix: Set matchId consistently
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // U23: Mark idempotency as completed (inside transaction for atomicity)
    await markIdempotencyCompleteInTransaction(
      transaction,
      uid,
      'offerRespond',
      idempotencyKey,
      {
        primaryId: matchRef.id,
        secondaryIds: [offerId],
        flags: { matchCreated: true },
      }
    );

    // Return result to outer scope
    return {
      cached: false,
      matchId: matchRef.id,
      offerId,
      matchCreated: true,
    };
  });

  // U23: If cached, return immediately (no cleanup or notifications)
  if (transactionResult.cached) {
    return {
      matchCreated: transactionResult.matchCreated,
      matchId: transactionResult.matchId,
      activeMatchId: transactionResult.matchId,
    };
  }

  // Post-match Cleanup using utility (Cancels all other offers involved)
  // Only run for fresh operations (not cached)
  await import('./cleanup').then(m => Promise.all([
    m.cleanupPendingOffers(db, offer.fromUid, offerId),
    m.cleanupPendingOffers(db, uid, offerId)
  ]));

  // U16: Send push notifications to both users
  // Fetch user profiles for display names
  const [user1Doc, user2Doc] = await Promise.all([
    db.collection('users').doc(user1Uid).get(),
    db.collection('users').doc(user2Uid).get(),
  ]);

  const user1DisplayName = user1Doc.data()?.displayName || 'Someone';
  const user2DisplayName = user2Doc.data()?.displayName || 'Someone';

  // Send notifications to both users (fire-and-forget)
  Promise.all([
    sendMatchCreatedNotification(user1Uid, user2DisplayName, matchRef.id),
    sendMatchCreatedNotification(user2Uid, user1DisplayName, matchRef.id),
  ]).catch((err) => {
    console.error('[offerRespond] Failed to send match notifications:', err);
  });

  return {
    matchCreated: true,
    matchId: matchRef.id,
    activeMatchId: matchRef.id // Return ID for client state update
  };
}
