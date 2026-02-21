import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import * as geofire from 'geofire-common';

interface OpeningHours {
    periods: {
        open?: { day: number; time: string };
        close?: { day: number; time: string };
    }[];
    weekday_text: string[];
}

interface PlaceCandidate {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    distance: number;
    rank: number;
    tags?: string[];
    priceLevel?: number;
    priceRange?: string;
    photoUrl?: string;
    openingHours?: OpeningHours | null;
}

const GOOGLE_TYPE_TO_CATEGORY: Record<string, string> = {
    // Cafe / Tea / Drink shops
    cafe: 'Cafe/Tea',
    coffee_shop: 'Cafe/Tea',
    tea_house: 'Cafe/Tea',
    bubble_tea_shop: 'Cafe/Tea',
    juice_bar: 'Cafe/Tea',
    smoothie_shop: 'Cafe/Tea',
    ice_cream_shop: 'Cafe/Tea',
    dessert_shop: 'Cafe/Tea',
    dessert_restaurant: 'Cafe/Tea',
    bakery: 'Cafe/Tea',
    // Restaurants
    restaurant: 'Restaurant',
    food: 'Restaurant',
    meal_takeaway: 'Restaurant',
    meal_delivery: 'Restaurant',
    // Bars — drink venues, not food
    bar: 'Cafe/Tea',
    night_club: 'Cafe/Tea',
    wine_bar: 'Cafe/Tea',
    cocktail_bar: 'Cafe/Tea',
    // Study / Academic
    library: 'Library',
    university: 'Study Space',
    school: 'Study Space',
    secondary_school: 'Study Space',
    primary_school: 'Study Space',
    // Outdoors
    park: 'Park',
};

const CATEGORY_DEFAULT_ACTIVITIES: Record<string, string[]> = {
    'Cafe/Tea': ['Drink'],
    Restaurant: ['Lunch', 'Dinner'],
    Library: ['Study'],
    Park: ['Walk', 'Hangout'],
    'Study Space': ['Study'],
    Other: ['Hangout'],
};

function deriveCategoryFromTypes(types: string[]): string {
    for (const t of types) {
        if (GOOGLE_TYPE_TO_CATEGORY[t]) return GOOGLE_TYPE_TO_CATEGORY[t];
    }
    return 'Other';
}

/**
 * Determine allowedActivities using category + opening hours.
 * For restaurants, checks opening_hours periods to decide Lunch vs Dinner.
 */
function determineActivities(category: string, openingHours?: OpeningHours | null): string[] {
    if (category !== 'Restaurant') {
        return CATEGORY_DEFAULT_ACTIVITIES[category] || ['Hangout'];
    }

    // Restaurant — use opening hours to determine Lunch/Dinner
    if (!openingHours || !openingHours.periods || openingHours.periods.length === 0) {
        return ['Lunch', 'Dinner'];
    }

    let servesLunch = false;
    let servesDinner = false;

    for (const period of openingHours.periods) {
        if (period.open && period.close) {
            const openTime = parseInt(period.open.time, 10);
            const closeTime = parseInt(period.close.time, 10);

            // Open spanning 11 AM – 2 PM → serves Lunch
            if (openTime <= 1400 && closeTime >= 1100) servesLunch = true;
            // Open spanning 5 PM – 8 PM → serves Dinner
            if (openTime <= 2000 && closeTime >= 1700) servesDinner = true;
        } else if (period.open && period.open.day === 0 && period.open.time === '0000' && !period.close) {
            // 24-hour place
            servesLunch = true;
            servesDinner = true;
        }
    }

    const activities: string[] = [];
    if (servesLunch) activities.push('Lunch');
    if (servesDinner) activities.push('Dinner');

    // Fallback: if heuristic couldn't determine, assume Dinner
    return activities.length > 0 ? activities : ['Dinner'];
}

interface MatchSearchCustomPlaceData {
    matchId: string;
    customPlace: PlaceCandidate;
}

export async function matchSearchCustomPlaceHandler(
    request: CallableRequest<MatchSearchCustomPlaceData>
) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Require email verification
    await requireEmailVerification(request);

    const uid = request.auth.uid;
    const { matchId, customPlace } = request.data;

    if (!matchId || typeof matchId !== 'string') {
        throw new HttpsError('invalid-argument', 'Match ID is required');
    }

    if (!customPlace || !customPlace.placeId || !customPlace.name) {
        throw new HttpsError('invalid-argument', 'Valid custom place data is required');
    }

    const db = admin.firestore();
    const matchRef = db.collection('matches').doc(matchId);

    const globalPlaceRef = db.collection('places').doc(customPlace.placeId);

    return await db.runTransaction(async (transaction) => {
        // --- ALL READS FIRST (Firestore transaction requirement) ---
        const [matchDoc, globalPlaceSnap] = await Promise.all([
            transaction.get(matchRef),
            transaction.get(globalPlaceRef),
        ]);

        if (!matchDoc.exists) {
            throw new HttpsError('not-found', 'Match not found');
        }

        const match = matchDoc.data()!;

        // Verify user is part of this match
        if (match.user1Uid !== uid && match.user2Uid !== uid) {
            throw new HttpsError('permission-denied', 'You are not part of this match');
        }

        // Verify match is in location_deciding status
        if (match.status !== 'location_deciding') {
            throw new HttpsError('failed-precondition', 'Location decision has already ended');
        }

        const placeCandidates: PlaceCandidate[] = match.placeCandidates || [];

        // Check if the place already exists in candidates
        const existingIndex = placeCandidates.findIndex((p) => p.placeId === customPlace.placeId);

        let finalPlaceId = customPlace.placeId;

        // --- ALL WRITES BELOW ---

        if (existingIndex === -1) {
            placeCandidates.push(customPlace);
            transaction.update(matchRef, {
                placeCandidates,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                [`telemetry.customPlacesAddedByUser.${uid}`]: admin.firestore.FieldValue.increment(1),
            });
        } else {
            finalPlaceId = placeCandidates[existingIndex].placeId;
        }

        // Upsert into the global places collection so it appears in admin/spots
        const category = deriveCategoryFromTypes(customPlace.tags || []);

        if (!globalPlaceSnap.exists) {
            const geohash = geofire.geohashForLocation([customPlace.lat, customPlace.lng]);
            transaction.set(globalPlaceRef, {
                name: customPlace.name,
                address: customPlace.address,
                lat: customPlace.lat,
                lng: customPlace.lng,
                geohash,
                category,
                tags: customPlace.tags || [],
                allowedActivities: determineActivities(category, customPlace.openingHours),
                active: true,
                priceRange: customPlace.priceRange || null,
                priceLevel: customPlace.priceLevel ?? null,
                photoUrl: customPlace.photoUrl || null,
                openingHours: customPlace.openingHours || null,
                source: 'user_custom',
                submittedBy: uid,
                timesSelected: 1,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else {
            transaction.update(globalPlaceRef, {
                timesSelected: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return {
            success: true,
            placeId: finalPlaceId
        };
    });
}
