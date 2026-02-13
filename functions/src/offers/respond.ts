import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendMatchCreatedNotification } from '../utils/notifications';
import {
  checkIdempotencyInTransaction,
  markIdempotencyCompleteInTransaction,
} from '../utils/idempotency';
import { createMatchAtomic } from '../matches/createMatchAtomic';

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

  // U22 FIX: Active match checks moved into transaction via createMatchAtomic guard
  // The guard doc in `activeMatchesByPair` prevents race conditions atomically
  // These outside-TX checks are REMOVED to eliminate TOCTOU races
  // If a user is already matched, createMatchAtomic will return existing match (idempotent)

  // Check activity/duration still compatible
  if (fromPresence.activity !== toPresence.activity) {
    await offerRef.update({
      status: 'expired',
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError('failed-precondition', 'Activities no longer match');
  }

  // U22 FIX: Use createMatchAtomic for race-free match creation
  const { idempotencyKey } = request.data;

  // U23: Transaction-scoped idempotency + U22: Atomic match creation with guard
  const transactionResult = await db.runTransaction(async (transaction) => {
    // U23: Check idempotency inside transaction
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

    // U22: Use atomic match creation helper with pair-level guard
    const matchResult = await createMatchAtomic(
      {
        user1Uid: offer.fromUid,
        user2Uid: uid,
        activity: offer.activity,
        durationMinutes: Math.min(offer.fromDurationMinutes || 30, offer.toDurationMinutes || 30),
        user1Coords: { lat: fromPresence.lat, lng: fromPresence.lng },
        user2Coords: { lat: toPresence.lat, lng: toPresence.lng },
        triggeringOfferId: offerId,
      },
      transaction // Run within this transaction for idempotency atomicity
    );

    const matchId = matchResult.matchId;

    // Update offer to accepted (createMatchAtomic handles presence updates)
    transaction.update(offerRef, {
      status: 'accepted',
      matchId,
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Clear sender's outgoing offers array
    transaction.update(fromPresenceDoc.ref, {
      activeOutgoingOfferIds: [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // U23: Mark idempotency as completed (inside transaction for atomicity)
    await markIdempotencyCompleteInTransaction(
      transaction,
      uid,
      'offerRespond',
      idempotencyKey,
      {
        primaryId: matchId,
        secondaryIds: [offerId],
        flags: { matchCreated: matchResult.isNewMatch },
      }
    );

    // Return result to outer scope
    return {
      cached: false,
      matchId,
      offerId,
      matchCreated: matchResult.isNewMatch,
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
    db.collection('users').doc(offer.fromUid).get(),
    db.collection('users').doc(uid).get(),
  ]);

  const user1DisplayName = user1Doc.data()?.displayName || 'Someone';
  const user2DisplayName = user2Doc.data()?.displayName || 'Someone';

  // Send notifications to both users (awaited to prevent Cloud Function early termination)
  const notifResults = await Promise.allSettled([
    sendMatchCreatedNotification(offer.fromUid, user2DisplayName, transactionResult.matchId!),
    sendMatchCreatedNotification(uid, user1DisplayName, transactionResult.matchId!),
  ]);
  notifResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[offerRespond] Notification ${i} failed:`, r.reason);
    }
  });

  return {
    matchCreated: true,
    matchId: transactionResult.matchId,
    activeMatchId: transactionResult.matchId // Return ID for client state update
  };
}
