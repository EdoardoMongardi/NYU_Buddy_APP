import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
  geohashQueryBounds,
  distanceBetween,
} from 'geofire-common';
import { requireEmailVerification } from '../utils/verifyEmail';

interface GetNearbyData {
  lat: number;
  lng: number;
  radiusKm?: number;
}

export async function mapStatusGetNearbyHandler(
  request: CallableRequest<GetNearbyData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const data = request.data;
  const db = admin.firestore();

  if (data.lat == null || data.lng == null) {
    throw new HttpsError('invalid-argument', 'Latitude and longitude are required');
  }

  const radiusKm = data.radiusKm || 2;
  const radiusMeters = radiusKm * 1000;
  const center: [number, number] = [data.lat, data.lng];
  const now = admin.firestore.Timestamp.now();

  // Get geohash bounds for the query
  const bounds = geohashQueryBounds(center, radiusMeters);

  // Execute parallel queries for each bound
  const snapshots = await Promise.all(
    bounds.map((b) =>
      db
        .collection('mapStatus')
        .orderBy('geohash')
        .startAt(b[0])
        .endAt(b[1])
        .get()
    )
  );

  // Merge results, filter by actual distance and expiration
  const statuses: Array<Record<string, unknown>> = [];
  const seenUids = new Set<string>();

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const d = doc.data();

      // Skip duplicates (can appear in overlapping geohash ranges)
      if (seenUids.has(d.uid)) continue;
      seenUids.add(d.uid);

      // Skip expired
      if (d.expiresAt && d.expiresAt.toMillis() <= now.toMillis()) continue;

      // Verify actual distance
      const distance = distanceBetween([d.lat, d.lng], center);
      if (distance > radiusKm) continue;

      statuses.push({
        uid: d.uid,
        statusText: d.statusText,
        emoji: d.emoji || '📍',
        lat: d.lat,
        lng: d.lng,
        expiresAt: d.expiresAt?.toDate?.()?.toISOString() || null,
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
      });
    }
  }

  // Round A: No density privacy — return all dots as-is

  return { statuses };
}
