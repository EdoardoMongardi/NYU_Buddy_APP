import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as geofire from 'geofire-common';

interface MatchFetchAllPlacesData {
    matchId: string;
}

// PRD v2.4: Hard cap 9, soft min 6, radius fallback
const HARD_CAP = 9;
const SOFT_MIN = 6;
const SEARCH_RADII_KM = [2, 3, 5]; // Fallback sequence
const LOCATION_DECISION_SECONDS = 120;

interface PlaceCandidate {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    distance: number;
    rank: number;
}

export async function matchFetchAllPlacesHandler(
    request: CallableRequest<MatchFetchAllPlacesData>
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
    const matchRef = db.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
        throw new HttpsError('not-found', 'Match not found');
    }

    const match = matchDoc.data()!;

    // Verify user is part of this match
    if (match.user1Uid !== uid && match.user2Uid !== uid) {
        throw new HttpsError('permission-denied', 'You are not part of this match');
    }

    // Idempotent: If already fetched, return existing candidates
    if (match.placeCandidates && match.placeCandidates.length > 0) {
        return {
            success: true,
            placeCandidates: match.placeCandidates,
            expiresAt: match.locationDecision?.expiresAt?.toDate?.()?.toISOString() || null,
            alreadyFetched: true,
        };
    }

    // Get both users' presence for midpoint calculation
    const [presence1Doc, presence2Doc] = await Promise.all([
        db.collection('presence').doc(match.user1Uid).get(),
        db.collection('presence').doc(match.user2Uid).get(),
    ]);

    // Calculate center point
    let centerLat: number;
    let centerLng: number;

    if (presence1Doc.exists && presence2Doc.exists) {
        const p1 = presence1Doc.data()!;
        const p2 = presence2Doc.data()!;
        centerLat = (p1.lat + p2.lat) / 2;
        centerLng = (p1.lng + p2.lng) / 2;
    } else if (presence1Doc.exists) {
        const p1 = presence1Doc.data()!;
        centerLat = p1.lat;
        centerLng = p1.lng;
    } else if (presence2Doc.exists) {
        const p2 = presence2Doc.data()!;
        centerLat = p2.lat;
        centerLng = p2.lng;
    } else {
        // Default: NYU Washington Square
        centerLat = 40.7295;
        centerLng = -73.9965;
    }

    const center: [number, number] = [centerLat, centerLng];
    const matchActivity = match.activity || null;

    // Try each radius until we have enough candidates
    let allPlaces: PlaceCandidate[] = [];

    for (const radiusKm of SEARCH_RADII_KM) {
        const places = await fetchPlacesWithinRadius(
            db,
            center,
            radiusKm,
            matchActivity,
            HARD_CAP
        );

        allPlaces = places;

        if (places.length >= SOFT_MIN) {
            console.log(`[matchFetchAllPlaces] Found ${places.length} candidates at ${radiusKm}km radius`);
            break;
        }

        console.log(`[matchFetchAllPlaces] Only ${places.length} candidates at ${radiusKm}km, expanding...`);
    }

    // Ensure we don't exceed hard cap and assign ranks
    const placeCandidates: PlaceCandidate[] = allPlaces
        .slice(0, HARD_CAP)
        .map((p, idx) => ({
            ...p,
            rank: idx + 1, // 1-indexed
        }));

    // Calculate expiresAt from matchedAt
    const matchedAt = match.matchedAt as admin.firestore.Timestamp;
    const expiresAtMillis = matchedAt.toMillis() + LOCATION_DECISION_SECONDS * 1000;
    const expiresAt = admin.firestore.Timestamp.fromMillis(expiresAtMillis);

    // Write to match document
    await matchRef.update({
        placeCandidates,
        locationDecision: {
            expiresAt,
        },
        // Initialize statusByUser if not already set (should be set on match creation)
        statusByUser: match.statusByUser || {
            [match.user1Uid]: 'pending',
            [match.user2Uid]: 'pending',
        },
        // Set status to location_deciding
        status: 'location_deciding',
        lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[matchFetchAllPlaces] Stored ${placeCandidates.length} candidates for match ${matchId}`);

    return {
        success: true,
        placeCandidates,
        expiresAt: expiresAt.toDate().toISOString(),
        alreadyFetched: false,
    };
}

async function fetchPlacesWithinRadius(
    db: admin.firestore.Firestore,
    center: [number, number],
    radiusKm: number,
    matchActivity: string | null,
    limit: number
): Promise<PlaceCandidate[]> {
    const radiusInM = radiusKm * 1000;
    const bounds = geofire.geohashQueryBounds(center, radiusInM);

    const placePromises: Promise<admin.firestore.QuerySnapshot>[] = [];

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

    const places: PlaceCandidate[] = [];
    const seenIds = new Set<string>();

    for (const snap of snapshots) {
        for (const doc of snap.docs) {
            // Avoid duplicates from overlapping geohash ranges
            if (seenIds.has(doc.id)) continue;
            seenIds.add(doc.id);

            const data = doc.data();

            // Calculate actual distance
            const distanceInM = geofire.distanceBetween(center, [data.lat, data.lng]) * 1000;

            // Only include if within radius
            if (distanceInM > radiusInM) continue;

            // Filter by activity if specified
            const allowedActivities: string[] = data.allowedActivities || [];
            if (matchActivity && allowedActivities.length > 0) {
                if (!allowedActivities.includes(matchActivity)) continue;
            }

            // PRD v2.4: Keep candidates lean (no photos, long descriptions)
            places.push({
                placeId: doc.id,
                name: data.name,
                address: data.address,
                lat: data.lat,
                lng: data.lng,
                distance: Math.round(distanceInM),
                rank: 0, // Will be assigned after sorting
            });
        }
    }

    // Sort by distance
    places.sort((a, b) => a.distance - b.distance);

    return places.slice(0, limit);
}
