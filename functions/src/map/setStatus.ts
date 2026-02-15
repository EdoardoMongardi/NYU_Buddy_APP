import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { geohashForLocation } from 'geofire-common';
import { requireEmailVerification } from '../utils/verifyEmail';
import { ACTIVITY_LIMITS } from '../constants/activityState';

interface SetStatusData {
  statusText: string;
  lat: number;
  lng: number;
}

export async function mapStatusSetHandler(
  request: CallableRequest<SetStatusData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data;
  const db = admin.firestore();

  // Validate statusText
  const statusText = data.statusText?.trim();
  if (!statusText || statusText.length === 0) {
    throw new HttpsError('invalid-argument', 'Status text is required');
  }
  if (statusText.length > ACTIVITY_LIMITS.MAP_STATUS_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Status text must be at most ${ACTIVITY_LIMITS.MAP_STATUS_MAX_LENGTH} characters`
    );
  }

  // Validate location
  if (data.lat == null || data.lng == null) {
    throw new HttpsError('invalid-argument', 'Latitude and longitude are required');
  }
  if (
    data.lat < ACTIVITY_LIMITS.NYC_LAT_MIN ||
    data.lat > ACTIVITY_LIMITS.NYC_LAT_MAX ||
    data.lng < ACTIVITY_LIMITS.NYC_LNG_MIN ||
    data.lng > ACTIVITY_LIMITS.NYC_LNG_MAX
  ) {
    throw new HttpsError('invalid-argument', 'Location must be in the NYC area');
  }

  const geohash = geohashForLocation([data.lat, data.lng]);
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + ACTIVITY_LIMITS.MAP_STATUS_EXPIRY_HOURS * 60 * 60 * 1000
  );

  // Upsert the map status doc (one per user)
  await db.collection('mapStatus').doc(uid).set({
    uid: uid,
    statusText: statusText,
    lat: data.lat,
    lng: data.lng,
    geohash: geohash,
    expiresAt: expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[MapStatus] User ${uid} set status: "${statusText}"`);

  return { success: true };
}
