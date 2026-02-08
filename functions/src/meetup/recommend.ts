import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as geofire from 'geofire-common';

interface MeetupRecommendData {
  matchId: string;
}

const SEARCH_RADIUS_KM = 2; // 2 km

export async function meetupRecommendHandler(
  request: CallableRequest<MeetupRecommendData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;
  const { matchId } = request.data;

  if (!matchId || typeof matchId !== 'string') {
    throw new HttpsError('invalid-argument', 'Match ID is required');
  }

  const db = admin.firestore();

  // Get match document
  const matchDoc = await db.collection('matches').doc(matchId).get();

  if (!matchDoc.exists) {
    throw new HttpsError('not-found', 'Match not found');
  }

  const match = matchDoc.data()!;

  // Verify user is part of this match
  if (match.user1Uid !== uid && match.user2Uid !== uid) {
    throw new HttpsError(
      'permission-denied',
      'You are not part of this match'
    );
  }

  // Get both users' presence (if available)
  const [presence1Doc, presence2Doc] = await Promise.all([
    db.collection('presence').doc(match.user1Uid).get(),
    db.collection('presence').doc(match.user2Uid).get(),
  ]);

  // Calculate midpoint if both have location, otherwise use available one
  let centerLat: number;
  let centerLng: number;

  if (presence1Doc.exists && presence2Doc.exists) {
    const p1 = presence1Doc.data()!;
    const p2 = presence2Doc.data()!;
    console.log(`[Recommend] P1: ${p1.lat},${p1.lng} | P2: ${p2.lat},${p2.lng}`);
    centerLat = (p1.lat + p2.lat) / 2;
    centerLng = (p1.lng + p2.lng) / 2;
  } else if (presence1Doc.exists) {
    const p1 = presence1Doc.data()!;
    console.log(`[Recommend] P1 only: ${p1.lat},${p1.lng}`);
    centerLat = p1.lat;
    centerLng = p1.lng;
  } else if (presence2Doc.exists) {
    const p2 = presence2Doc.data()!;
    console.log(`[Recommend] P2 only: ${p2.lat},${p2.lng}`);
    centerLat = p2.lat;
    centerLng = p2.lng;
  } else {
    console.log('[Recommend] No presence data, using default NYU location');
    // No location data, use NYU Washington Square as default
    centerLat = 40.7295;
    centerLng = -73.9965;
  }

  console.log(`[Recommend] Center: ${centerLat},${centerLng}`);

  // Query nearby places using geohash
  const center: [number, number] = [centerLat, centerLng];
  const radiusInM = SEARCH_RADIUS_KM * 1000;
  const bounds = geofire.geohashQueryBounds(center, radiusInM);

  const placePromises: Promise<
    admin.firestore.QuerySnapshot<admin.firestore.DocumentData>
  >[] = [];

  for (const b of bounds) {
    const q = db
      .collection('places')
      .where('active', '==', true)
      .orderBy('geohash')
      .startAt(b[0])
      .endAt(b[1]);
    placePromises.push(q.get());
  }

  const snapshots = await Promise.all(placePromises);

  // Get the activity from the match to filter places
  const matchActivity = match.activity || null;

  // Filter and calculate distances
  const places: Array<{
    id: string;
    name: string;
    category: string;
    address: string;
    distance: number;
    lat?: number;
    lng?: number;
  }> = [];

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const data = doc.data();

      // Calculate actual distance
      const distanceInM = geofire.distanceBetween(
        center,
        [data.lat, data.lng]
      ) * 1000; // Convert km to m

      console.log(`[Recommend] Place ${data.name} (${data.lat},${data.lng}) -> Dist: ${distanceInM}m`);

      // Only include if within radius
      if (distanceInM > radiusInM) {
        continue;
      }

      // Filter by allowed activities if the match has an activity
      const allowedActivities: string[] = data.allowedActivities || [];
      if (matchActivity && allowedActivities.length > 0) {
        if (!allowedActivities.includes(matchActivity)) {
          continue;
        }
      }

      places.push({
        id: doc.id,
        name: data.name,
        category: data.category,
        address: data.address,
        distance: Math.round(distanceInM),
        lat: data.lat,
        lng: data.lng,
      });
    }
  }

  // Sort by distance and return top 3
  places.sort((a, b) => a.distance - b.distance);

  return { places: places.slice(0, 3) };
}

interface UpdateMatchStatusData {
  matchId: string;
  status: 'heading_there' | 'arrived' | 'completed';
}

export async function updateMatchStatusHandler(
  request: CallableRequest<UpdateMatchStatusData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;
  const { matchId, status } = request.data;

  if (!matchId || typeof matchId !== 'string') {
    throw new HttpsError('invalid-argument', 'Match ID is required');
  }

  const validStatuses = ['heading_there', 'arrived', 'completed'];
  if (!validStatuses.includes(status)) {
    throw new HttpsError('invalid-argument', 'Invalid status');
  }

  const db = admin.firestore();

  // Get match document
  const matchRef = db.collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new HttpsError('not-found', 'Match not found');
  }

  const match = matchDoc.data()!;

  // Verify user is part of this match
  if (match.user1Uid !== uid && match.user2Uid !== uid) {
    throw new HttpsError(
      'permission-denied',
      'You are not part of this match'
    );
  }

  // Update user's status
  const statusByUser = { ...match.statusByUser, [uid]: status };

  // Determine overall match status
  // If both users have the same status, update the match status
  const user1Status = statusByUser[match.user1Uid];
  const user2Status = statusByUser[match.user2Uid];

  let overallStatus = match.status;

  // Progress status based on both users
  if (user1Status === 'completed' && user2Status === 'completed') {
    overallStatus = 'completed';
  } else if (user1Status === 'arrived' && user2Status === 'arrived') {
    overallStatus = 'arrived';
  } else if (
    (user1Status === 'heading_there' || user1Status === 'arrived') &&
    (user2Status === 'heading_there' || user2Status === 'arrived')
  ) {
    overallStatus = 'heading_there';
  }

  // Update match status
  await matchRef.update({
    statusByUser,
    status: overallStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // U15 Fix: Clear presence.matchId when match is completed (terminal state)
  if (overallStatus === 'completed') {
    const db = admin.firestore();
    const batch = db.batch();

    // Clear matchId for both users' presence documents
    const user1PresenceRef = db.collection('presence').doc(match.user1Uid);
    const user2PresenceRef = db.collection('presence').doc(match.user2Uid);

    batch.update(user1PresenceRef, {
      matchId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(user2PresenceRef, {
      matchId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log(`[updateMatchStatus] Cleared presence.matchId for completed match ${matchId}`);
  }

  return { success: true };
}