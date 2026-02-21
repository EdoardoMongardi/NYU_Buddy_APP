import { Client, PlaceType1, PlacesNearbyRanking } from '@googlemaps/google-maps-services-js';
import * as admin from 'firebase-admin';
import * as geofire from 'geofire-common';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

if (!GOOGLE_PLACES_API_KEY) {
    console.error("❌ GOOGLE_PLACES_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set in .env.local");
    process.exit(1);
}

// Initialize Firebase Admin (assuming default env vars are set or using default credentials)
if (admin.apps.length === 0) {
    // If you have a service account key, you might need to load it here
    // For local dev, GOOGLE_APPLICATION_CREDENTIALS should be set in environment
    console.log("Initializing Firebase Admin with application default credentials...");
    admin.initializeApp();
}

const db = admin.firestore();
const googleClient = new Client({});

// --- Configuration ---

const TARGET_AREAS = [
    { name: 'Washington Square', lat: 40.7295, lng: -73.9965 },
    { name: 'Brooklyn Campus', lat: 40.6945, lng: -73.9866 },
    { name: 'Union Square/14th', lat: 40.7359, lng: -73.9911 },
];

const RADIUS_METERS = 1000;
const MIN_RATING = 4.0;
const FETCH_LIMIT_PER_CATEGORY = 30; // Max per category per location (Google Nearby returns max 60 via pagination)

// We map our generalized categories to Google Place Types
const CATEGORY_MAPPINGS = [
    { name: 'Cafe', type: PlaceType1.cafe },
    { name: 'Restaurant', type: PlaceType1.restaurant },
    { name: 'Study Space', type: PlaceType1.library },
    { name: 'Park', type: PlaceType1.park },
];

// --- Helper Functions ---

/**
 * Determine 'allowedActivities' based on Category and Google's opening_hours.
 */
function determineActivities(category: string, openingHours: any): string[] {
    if (category === 'Park') return ['Walk'];
    if (category === 'Cafe') return ['Coffee', 'Study'];
    if (category === 'Study Space') return ['Study'];

    if (category === 'Restaurant') {
        const activities = new Set<string>();

        if (!openingHours || !openingHours.periods) {
            // Fallback for restaurants with no hours: assume open for both
            return ['Lunch', 'Dinner'];
        }

        let servesLunch = false;
        let servesDinner = false;

        for (const period of openingHours.periods) {
            if (period.open && period.close) {
                const openTime = parseInt(period.open.time);
                const closeTime = parseInt(period.close.time);

                // Very rough heuristic (e.g., "0800" = 800, "1600" = 1600)
                // If open spanning 11am-2pm, consider it Lunch
                if (openTime <= 1400 && closeTime >= 1100) servesLunch = true;

                // If open spanning 5pm-8pm, consider it Dinner
                if (openTime <= 2000 && closeTime >= 1700) servesDinner = true;
            } else if (period.open && period.open.day === 0 && period.open.time === "0000" && !period.close) {
                // 24 hours
                servesLunch = true;
                servesDinner = true;
            }
        }

        if (servesLunch) activities.add('Lunch');
        if (servesDinner) activities.add('Dinner');

        // If our logic failed but it's a restaurant, fallback
        if (activities.size === 0) return ['Dinner'];

        return Array.from(activities);
    }

    return [];
}

/**
 * Format opening hours for Firestore storage
 */
function formatOpeningHours(googleHours: any) {
    if (!googleHours) return null;
    return {
        periods: googleHours.periods || [],
        weekday_text: googleHours.weekday_text || [],
    };
}

// --- Main Execution ---

async function runSeeding() {
    console.log(`🌱 Starting Place Seeding...`);
    let totalAdded = 0;

    for (const area of TARGET_AREAS) {
        console.log(`\n========================================`);
        console.log(`📍 Fetching places near ${area.name}`);
        console.log(`========================================`);

        for (const catMapping of CATEGORY_MAPPINGS) {
            console.log(`\n🔍 Searching for ${catMapping.name}s...`);

            try {
                // Fetch Places (ordered by prominence is default when radius is provided)
                const response = await googleClient.placesNearby({
                    params: {
                        location: [area.lat, area.lng],
                        radius: RADIUS_METERS,
                        type: catMapping.type,
                        key: GOOGLE_PLACES_API_KEY as string,
                    }
                });

                let results = response.data.results || [];

                // Filter by minimum rating
                results = results.filter(p => (p.rating || 0) >= MIN_RATING);

                // Sort by user_ratings_total (prominence proxy) to get the most popular
                results.sort((a, b) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0));

                // Limit
                results = results.slice(0, FETCH_LIMIT_PER_CATEGORY);

                console.log(`   Found ${results.length} valid ${catMapping.name}s (Rating >= ${MIN_RATING})`);

                let addedCounter = 0;

                for (const place of results) {
                    if (!place.place_id) continue;

                    // Fetch full details to get opening_hours and formatted address
                    const detailsResponse = await googleClient.placeDetails({
                        params: {
                            place_id: place.place_id,
                            fields: ['name', 'formatted_address', 'geometry', 'opening_hours', 'price_level', 'photos', 'types'],
                            key: GOOGLE_PLACES_API_KEY as string
                        }
                    });

                    const details = detailsResponse.data.result;
                    if (!details || !details.geometry || !details.geometry.location) continue;

                    const lat = details.geometry.location.lat;
                    const lng = details.geometry.location.lng;
                    const geohash = geofire.geohashForLocation([lat, lng]);

                    // Determine Photo URL
                    let photoUrl = null;
                    if (details.photos && details.photos.length > 0) {
                        const photoRef = details.photos[0].photo_reference;
                        photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
                    }

                    // Price Range string mapping (U11)
                    const priceRangeMapping = ['$', '$$', '$$$', '$$$$'];
                    let priceString = null;
                    if (details.price_level !== undefined && details.price_level >= 0) {
                        priceString = priceRangeMapping[details.price_level] || '$$';
                    }

                    // Determine tags (just using Google types as basic tags)
                    const tags = (details.types || []).filter(t => !['establishment', 'point_of_interest'].includes(t)).slice(0, 3);

                    // Determine Activities & Opening Hours
                    const allowedActivities = determineActivities(catMapping.name, details.opening_hours);
                    const openingHoursData = formatOpeningHours(details.opening_hours);

                    const placeData = {
                        name: details.name || place.name || 'Unknown Name',
                        category: catMapping.name,
                        address: details.formatted_address || place.vicinity || '',
                        lat: lat,
                        lng: lng,
                        geohash: geohash,
                        tags: tags,
                        allowedActivities: allowedActivities,
                        active: true,
                        priceRange: priceString,
                        photoUrl: photoUrl,
                        openingHours: openingHoursData,
                        googlePlaceId: place.place_id,
                        rating: place.rating || null,
                        userRatingsTotal: place.user_ratings_total || 0,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    };

                    // Save to Firestore. We use the google_place_id as the document ID to prevent duplicates
                    const docRef = db.collection('places').doc(place.place_id);
                    await docRef.set(placeData, { merge: true }); // Merge updates existing

                    addedCounter++;
                    totalAdded++;
                }
                console.log(`   ✅ Seeded ${addedCounter} ${catMapping.name}s.`);

            } catch (error: any) {
                console.log(`   ❌ Error fetching ${catMapping.name}:`, error.message);
                if (error.response) console.error(error.response.data);
            }
        }
    }

    console.log(`\n🎉 Seeding Complete! Seeded/Updated ${totalAdded} total places.`);
}

runSeeding().then(() => process.exit(0)).catch((err) => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
