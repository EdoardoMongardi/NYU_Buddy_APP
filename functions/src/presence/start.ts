import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as geofire from 'geofire-common';
import { v4 as uuidv4 } from 'uuid';
import { requireEmailVerification } from '../utils/verifyEmail';
import { withIdempotencyLock, MinimalResult } from '../utils/idempotency';

const GRACE_PERIOD_MINUTES = 5;
const MAX_SESSIONS_PER_HOUR = 100;

interface PresenceStartData {
  activity: string;
  durationMin: number;
  lat: number;
  lng: number;
  idempotencyKey?: string; // U23: Optional idempotency key for duplicate prevention
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
  const { activity, durationMin, lat, lng, idempotencyKey } = request.data;
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
    .where('createdAt', '>', Timestamp.fromDate(oneHourAgo))
    .get();

  if (recentSessionsSnapshot.size >= MAX_SESSIONS_PER_HOUR) {
    throw new HttpsError(
      'resource-exhausted',
      `Maximum ${MAX_SESSIONS_PER_HOUR} sessions per hour. Please try again later.`
    );
  }

  // U23: Wrap session creation with idempotency lock
  const { result, cached } = await withIdempotencyLock<MinimalResult & { success: boolean; sessionId: string; expiresAt: string }>(
    uid,
    'presenceStart',
    idempotencyKey,
    async () => {
      // U23 P1: Business-level idempotency check (defense against partial failures)
      // If presence doc already exists with active session AND parameters match, return existing session
      const presenceRef = db.collection('presence').doc(uid);
      const existingPresence = await presenceRef.get();

      if (existingPresence.exists) {
        const presenceData = existingPresence.data();
        const now = Date.now();

        // Check if existing session is still valid (not expired, status available)
        // AND parameters match (activity must be same - user might be changing their plan)
        if (
          presenceData?.status === 'available' &&
          presenceData?.expiresAt &&
          presenceData.expiresAt.toMillis() > now &&
          presenceData?.sessionId &&
          presenceData?.activity === activity // Must match requested activity
        ) {
          console.log(
            `[presenceStart] Active session already exists with matching parameters ` +
            `(sessionId: ${presenceData.sessionId.substring(0, 8)}..., activity: ${activity}), ` +
            `returning existing session (business-level idempotency)`
          );

          return {
            primaryId: presenceData.sessionId,
            flags: { success: true, reusedExisting: true }, // Flag for frontend
            success: true,
            sessionId: presenceData.sessionId,
            expiresAt: presenceData.expiresAt.toDate().toISOString(),
            reusedExisting: true, // Tell frontend this is a reused session
          } as MinimalResult & { success: boolean; sessionId: string; expiresAt: string; reusedExisting: boolean };
        }

        // If parameters don't match (e.g., different activity), don't reuse
        // User is trying to change their session - should call presenceEnd first
        if (presenceData?.status === 'available' && presenceData?.activity !== activity) {
          console.log(
            `[presenceStart] Active session exists but activity mismatch ` +
            `(existing: ${presenceData.activity}, requested: ${activity}). ` +
            `User should call presenceEnd first.`
          );
          throw new HttpsError(
            'failed-precondition',
            `You already have an active "${presenceData.activity}" session. Please end it before starting a new "${activity}" session.`
          );
        }
      }

      // No active session exists - create new one
      // Generate session ID
      const sessionId = uuidv4();

      // Generate geohash for location-based queries
      const geohash = geofire.geohashForLocation([lat, lng]);

      // Calculate expiration time (duration + grace period)
      const expiresAt = Timestamp.fromDate(
        new Date(Date.now() + (durationMin + GRACE_PERIOD_MINUTES) * 60 * 1000)
      );

      const now = FieldValue.serverTimestamp();

      // Set presence document (presenceRef already declared above)
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

      // Return minimal result for caching
      return {
        primaryId: sessionId,
        flags: { success: true },
        success: true,
        sessionId,
        expiresAt: expiresAt.toDate().toISOString(),
      } as MinimalResult & { success: boolean; sessionId: string; expiresAt: string };
    }
  );

  if (cached) {
    console.log(`[presenceStart] Returning cached result (session already started)`);
  }

  return {
    success: result.success,
    sessionId: result.sessionId,
    expiresAt: result.expiresAt,
  };
}