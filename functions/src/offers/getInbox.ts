import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

const MAX_INBOX_SIZE = 3;

interface InboxOffer {
  offerId: string;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoURL: string | null;
  fromInterests: string[];
  activity: string;
  distanceMeters: number;
  explanation: string;
  matchScore: number;
  expiresAt: string;
  expiresInSeconds: number;
}

export async function offersGetInboxHandler(request: CallableRequest) {
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
      totalCount: 0,
    };
  }

  const presence = presenceDoc.data()!;
  if (presence.expiresAt.toMillis() < now.toMillis()) {
    return {
      offers: [],
      totalCount: 0,
    };
  }

  // Query pending offers to this user that haven't expired
  const offersQuery = await db.collection('offers')
    .where('toUid', '==', uid)
    .where('status', '==', 'pending')
    .where('expiresAt', '>', now)
    .orderBy('expiresAt', 'asc')
    .limit(MAX_INBOX_SIZE * 2) // Get extra to account for expired ones
    .get();

  // Count total pending offers
  const totalCountQuery = await db.collection('offers')
    .where('toUid', '==', uid)
    .where('status', '==', 'pending')
    .where('expiresAt', '>', now)
    .count()
    .get();

  const totalCount = totalCountQuery.data().count;

  // Enrich offers with sender info
  const offers: InboxOffer[] = [];

  for (const offerDoc of offersQuery.docs) {
    if (offers.length >= MAX_INBOX_SIZE) break;

    const offer = offerDoc.data();

    // Double-check expiration
    if (offer.expiresAt.toMillis() <= now.toMillis()) {
      continue;
    }

    // Get sender's user profile
    const senderDoc = await db.collection('users').doc(offer.fromUid).get();
    const senderData = senderDoc.exists ? senderDoc.data()! : {};

    offers.push({
      offerId: offerDoc.id,
      fromUid: offer.fromUid,
      fromDisplayName: senderData.displayName || 'NYU Student',
      fromPhotoURL: senderData.photoURL || null,
      fromInterests: senderData.interests || [],
      activity: offer.activity,
      distanceMeters: offer.distanceMeters || 0,
      explanation: offer.explanation || '',
      matchScore: offer.matchScore || 0,
      expiresAt: offer.expiresAt.toDate().toISOString(),
      expiresInSeconds: Math.max(0, Math.floor((offer.expiresAt.toMillis() - now.toMillis()) / 1000)),
    });
  }

  return {
    offers,
    totalCount,
  };
}
