import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as geofire from 'geofire-common';
import { v4 as uuidv4 } from 'uuid';
import { requireEmailVerification } from '../utils/verifyEmail';

const GRACE_PERIOD_MINUTES = 5;
const MAX_SESSIONS_PER_HOUR = 100;

interface PresenceStartData {
  activity: string;
  durationMin: number;
  lat: number;
  lng: number;
}

export async function presenceStartHandler(
  request: CallableRequest<PresenceStartData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // U21 Fix: Require email verification (zero grace period)
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const { activity, durationMin, lat, lng } = request.data;
  const db = admin.firestore();

  // Validate inputs
  if (!activity || typeof activity !== 'string') {
    throw new HttpsError('invalid-argument', 'Activity is required');
  }

  if (!durationMin || durationMin < 15 || durationMin > 240) {
    throw new HttpsError(
      'invalid-argument',
      'Duration must be between 15 and 240 minutes'
    );
  }

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new HttpsError('invalid-argument', 'Valid coordinates are required');
  }

  // Validate coordinates are within reasonable bounds (around NYC area)
  if (lat < 40.4 || lat > 41.0 || lng < -74.3 || lng > -73.7) {
    throw new HttpsError(
      'invalid-argument',
      'Location must be within the NYC area'
    );
  }

  // Rate limiting: Check sessions in the past hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentSessionsSnapshot = await db
    .collection('sessionHistory')
    .doc(uid)
    .collection('sessions')
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(oneHourAgo))
    .get();

  if (recentSessionsSnapshot.size >= MAX_SESSIONS_PER_HOUR) {
    throw new HttpsError(
      'resource-exhausted',
      `Maximum ${MAX_SESSIONS_PER_HOUR} sessions per hour. Please try again later.`
    );
  }

  // Generate session ID
  const sessionId = uuidv4();

  // Generate geohash for location-based queries
  const geohash = geofire.geohashForLocation([lat, lng]);

  // Calculate expiration time (duration + grace period)
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + (durationMin + GRACE_PERIOD_MINUTES) * 60 * 1000)
  );

  const now = admin.firestore.FieldValue.serverTimestamp();

  // Set presence document
  const presenceRef = db.collection('presence').doc(uid);

  await presenceRef.set({
    uid,
    activity,
    durationMinutes: durationMin,
    lat,
    lng,
    geohash,
    status: 'available',
    sessionId,
    seenCandidateIds: [],
    // Offer-related fields
    activeOutgoingOfferId: null,
    offerCooldownUntil: null,
    exposureScore: 0,
    lastExposedAt: null,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  // Record session in history for rate limiting
  await db
    .collection('sessionHistory')
    .doc(uid)
    .collection('sessions')
    .doc(sessionId)
    .set({
      sessionId,
      activity,
      durationMinutes: durationMin,
      createdAt: now,
    });

  return {
    success: true,
    sessionId,
    expiresAt: expiresAt.toDate().toISOString(),
  };
}