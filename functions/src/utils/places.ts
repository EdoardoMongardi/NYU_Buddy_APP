/**
 * Shared utility for fetching place candidates
 * Single source of truth for location availability checks
 * PRD v2.4: radius fallback (2km→3km→5km), hard cap 9, soft min 6
 */

import * as admin from 'firebase-admin';
import * as geofire from 'geofire-common';

// Constants
export const HARD_CAP = 9;
export const SOFT_MIN = 6;
export const SEARCH_RADII_KM = [2, 3, 5];
export const LOCATION_DECISION_SECONDS = 600;
export const LOCATION_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface PlaceCandidate {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    distance: number; // meters
    rank: number;     // 1-indexed
    tags?: string[];
    priceLevel?: number;
    priceRange?: string | null; // U11: e.g., "$20-$50" (preferred over priceLevel)
    photoUrl?: string | null;
}

export interface GetPlaceCandidatesOptions {
    center: [number, number]; // [lat, lng]
    activityType?: string | null;
    hardCap?: number;
    softMin?: number;
    radii?: number[];
}

/**
 * Fetch place candidates from a center point with radius fallback
 * This is the ONLY "places availability" logic used everywhere
 * 
 * Algorithm:
 * 1. Try radius 2km; if < 6 results, expand to 3km; if still < 6 expand to 5km
 * 2. Filter: isActive == true, matches activityType
 * 3. Sort by distance ascending
 * 4. Return up to 9 (ranked 1-indexed)
 */
export async function getPlaceCandidates(
    options: GetPlaceCandidatesOptions
): Promise<PlaceCandidate[]> {
    const {
        center,
        activityType = null,
        hardCap = HARD_CAP,
        softMin = SOFT_MIN,
        radii = SEARCH_RADII_KM,
    } = options;

    const db = admin.firestore();
    let allPlaces: PlaceCandidate[] = [];

    for (const radiusKm of radii) {
        const places = await fetchPlacesWithinRadius(
            db,
            center,
            radiusKm,
            activityType,
            hardCap
        );

        allPlaces = places;

        if (places.length >= softMin) {
            console.log(`[getPlaceCandidates] Found ${places.length} candidates at ${radiusKm}km radius`);
            break;
        }

        console.log(`[getPlaceCandidates] Only ${places.length} candidates at ${radiusKm}km, expanding...`);
    }

    // Ensure we don't exceed hard cap and assign ranks
    return allPlaces.slice(0, hardCap).map((p, idx) => ({
        ...p,
        rank: idx + 1, // 1-indexed
    }));
}

/**
 * Returns { day, timeNum } in NYC local time.
 * day: 0=Sunday … 6=Saturday (matches Google Places API period.open.day)
 * timeNum: HHMM integer, e.g. 1430 for 2:30 PM
 */
function getNYCTimeInfo(): { day: number; timeNum: number } {
    const now = new Date();
    const dayStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    });
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = dayMap[dayStr] ?? 0;
    const [rawH, rawM] = timeStr.split(':').map(Number);
    // toLocaleTimeString hour12:false may return "24" for midnight
    const timeNum = (rawH >= 24 ? 0 : rawH) * 100 + (rawM || 0);
    return { day, timeNum };
}

/**
 * Returns true if the place is currently open based on stored openingHours.
 * Defaults to true (open) when no data is available.
 */
function isOpenNow(openingHours: unknown): boolean {
    const oh = openingHours as {
        periods?: {
            open?: { day: number; time: string };
            close?: { day: number; time: string };
        }[];
    } | null | undefined;

    // No data → assume open
    if (!oh || !oh.periods || oh.periods.length === 0) return true;

    const { day: currentDay, timeNum: currentTime } = getNYCTimeInfo();

    for (const period of oh.periods) {
        const { open, close } = period;

        // 24-hour place: open.day=0, open.time="0000", no close entry
        if (open && open.day === 0 && open.time === '0000' && !close) return true;

        if (!open || !close) continue;

        const openDay  = open.day;
        const closeDay = close.day;
        const openTime  = parseInt(open.time,  10);
        const closeTime = parseInt(close.time, 10);

        if (openDay === closeDay) {
            // Normal same-day period
            if (currentDay === openDay && currentTime >= openTime && currentTime < closeTime) return true;
        } else {
            // Overnight period (e.g. Fri 22:00 → Sat 02:00)
            if (currentDay === openDay  && currentTime >= openTime)  return true;
            if (currentDay === closeDay && currentTime <  closeTime) return true;
        }
    }

    return false;
}

/**
 * Inner function to fetch places within a specific radius
 */
async function fetchPlacesWithinRadius(
    db: admin.firestore.Firestore,
    center: [number, number],
    radiusKm: number,
    activityType: string | null,
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
            if (activityType && allowedActivities.length > 0) {
                if (!allowedActivities.includes(activityType)) continue;
            }

            // Filter out places that are currently closed (default open if no hours data)
            if (!isOpenNow(data.openingHours)) {
                console.log(`[fetchPlacesWithinRadius] Skipping closed place: ${data.name}`);
                continue;
            }

            places.push({
                placeId: doc.id,
                name: data.name,
                address: data.address,
                lat: data.lat,
                lng: data.lng,
                distance: Math.round(distanceInM),
                rank: 0, // Will be assigned after sorting
                tags: data.tags || [],
                priceLevel: data.priceLevel || 2,
                priceRange: data.priceRange || null, // U11: Custom price range from admin
                photoUrl: data.photoUrl || null,
            });
        }
    }

    // Sort by distance
    places.sort((a, b) => a.distance - b.distance);

    return places.slice(0, limit);
}

/**
 * Get user's location from presence collection with staleness check
 * @returns location or null if stale/missing
 */
export async function getUserLocation(
    uid: string
): Promise<{ lat: number; lng: number; isStale: boolean } | null> {
    const db = admin.firestore();
    const presenceDoc = await db.collection('presence').doc(uid).get();

    if (!presenceDoc.exists) {
        console.log(`[getUserLocation] No presence doc for ${uid}`);
        return null;
    }

    const presence = presenceDoc.data()!;

    if (typeof presence.lat !== 'number' || typeof presence.lng !== 'number') {
        console.log(`[getUserLocation] Invalid coords for ${uid}: ${presence.lat}, ${presence.lng}`);
        return null;
    }

    // Check staleness
    const updatedAt = presence.updatedAt as admin.firestore.Timestamp | undefined;
    const now = Date.now();
    const isStale = updatedAt
        ? (now - updatedAt.toMillis()) > LOCATION_STALE_THRESHOLD_MS
        : true; // If no timestamp, consider stale

    if (isStale) console.log(`[getUserLocation] Stale location for ${uid} (updatedAt: ${updatedAt?.toDate()})`);

    return {
        lat: presence.lat,
        lng: presence.lng,
        isStale,
    };
}

/**
 * Calculate midpoint between two locations
 */
export function calculateMidpoint(
    loc1: { lat: number; lng: number },
    loc2: { lat: number; lng: number }
): [number, number] {
    return [
        (loc1.lat + loc2.lat) / 2,
        (loc1.lng + loc2.lng) / 2,
    ];
}

/**
 * Default location (NYU Washington Square)
 */
export const DEFAULT_LOCATION: [number, number] = [40.7295, -73.9965];
