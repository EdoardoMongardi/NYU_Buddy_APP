/**
 * Targeted place seeder — Washington Square, 2km radius
 *
 * Targets:
 *   - 50 new Restaurant places (Lunch / Dinner)
 *   - 30 new Drink places (Cafe/Tea / Bar)
 *
 * Filters:
 *   - Not already in Firestore
 *   - price_level <= 2  (Under $10 / $10-$20 / $20-$50)
 *     Places with NO price_level are included but flagged
 *   - Within 2 km of Washington Square
 *
 * Usage:
 *   DRY_RUN only (default):
 *     tsx scripts/seed-targeted.ts
 *
 *   Actually seed:
 *     SEED=true tsx scripts/seed-targeted.ts
 */

import { Client, PlaceType1 } from '@googlemaps/google-maps-services-js';
import admin from 'firebase-admin';
import * as geofire from 'geofire-common';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY not set in .env.local');
    process.exit(1);
}

if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
const googleClient = new Client({});

// ─── Config ─────────────────────────────────────────────────────────────────

const CENTER = { lat: 40.7295, lng: -73.9965 }; // Washington Square
const RADIUS_METERS = 2000;
const MAX_PRICE_LEVEL = 2; // include 0($), 1($$), 2($$$) — exclude 3+

// Place names containing any of these keywords are assumed expensive and excluded
// even when Google has no price_level data for them.
const EXPENSIVE_NAME_KEYWORDS = ['omakase', 'tasting menu', 'kaiseki', 'prix fixe'];
const TARGET_RESTAURANT = 50;
const TARGET_DRINK = 30;
const DRY_RUN = process.env.SEED !== 'true';

const PRICE_RANGE_MAP: Record<number, string> = {
    0: 'Under $10',
    1: '$10-$20',
    2: '$20-$50',
    3: '$50+',
    4: '$50+',
};

// Google types to search for each goal.
// Each type is queried separately (max ~60 results each via pagination) then deduplicated.
const RESTAURANT_TYPES: PlaceType1[] = [
    PlaceType1.restaurant,
    PlaceType1.meal_takeaway,
    PlaceType1.meal_delivery,
];
// Additional cuisine keywords searched alongside `restaurant` type to uncover
// places that may not surface under the generic restaurant type alone.
const RESTAURANT_KEYWORDS = [
    'sushi restaurant',
    'ramen',
    'chinese restaurant',
    'korean restaurant',
    'italian restaurant',
    'mexican restaurant',
    'indian restaurant',
    'thai restaurant',
    'japanese restaurant',
    'pizza restaurant',
    'burger restaurant',
    'vietnamese restaurant',
    'mediterranean restaurant',
    'middle eastern restaurant',
    'american restaurant',
];

const DRINK_TYPES: PlaceType1[] = [PlaceType1.cafe, PlaceType1.bar, PlaceType1.bakery];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function determineActivities(category: string, openingHours: any): string[] {
    if (category === 'Cafe/Tea') return ['Drink'];
    if (category === 'Library') return ['Study'];
    if (category === 'Study Space') return ['Study'];
    if (category === 'Park') return ['Walk', 'Hangout'];
    if (category !== 'Restaurant') return ['Hangout'];

    if (!openingHours?.periods) return ['Lunch', 'Dinner'];

    let servesLunch = false, servesDinner = false;
    for (const period of openingHours.periods) {
        if (period.open && period.close) {
            const openTime  = parseInt(period.open.time,  10);
            const closeTime = parseInt(period.close.time, 10);
            if (openTime <= 1400 && closeTime >= 1100) servesLunch  = true;
            if (openTime <= 2000 && closeTime >= 1700) servesDinner = true;
        } else if (period.open?.day === 0 && period.open?.time === '0000' && !period.close) {
            servesLunch = servesDinner = true;
        }
    }
    const acts: string[] = [];
    if (servesLunch)  acts.push('Lunch');
    if (servesDinner) acts.push('Dinner');
    return acts.length > 0 ? acts : ['Dinner'];
}

function mapTypeToCategory(types: string[]): string {
    const DRINK_RAW = new Set(['cafe', 'coffee_shop', 'tea_house', 'bubble_tea_shop', 'juice_bar',
        'smoothie_shop', 'ice_cream_shop', 'dessert_shop', 'dessert_restaurant', 'bakery',
        'bar', 'night_club', 'wine_bar', 'cocktail_bar']);
    for (const t of types) {
        if (t === 'restaurant' || t === 'meal_takeaway' || t === 'meal_delivery' || t === 'food') return 'Restaurant';
        if (DRINK_RAW.has(t)) return 'Cafe/Tea';
        if (t === 'library') return 'Library';
        if (t === 'university' || t === 'school') return 'Study Space';
        if (t === 'park') return 'Park';
    }
    return 'Other';
}

/** Fetch up to 3 pages (max ~60 results) from Places Nearby for one type */
async function fetchAllNearby(type: PlaceType1): Promise<any[]> {
    const results: any[] = [];
    let pagetoken: string | undefined;

    for (let page = 0; page < 3; page++) {
        const resp = await googleClient.placesNearby({
            params: {
                location: [CENTER.lat, CENTER.lng],
                radius: RADIUS_METERS,
                type,
                ...(pagetoken ? { pagetoken } : {}),
                key: GOOGLE_PLACES_API_KEY as string,
            },
        });
        results.push(...(resp.data.results || []));
        const next = resp.data.next_page_token;
        if (!next) break;
        pagetoken = next;
        await new Promise(r => setTimeout(r, 2200)); // Google requires a delay before using next_page_token
    }
    return results;
}

/** Fetch up to 1 page from Places Nearby using a keyword + restaurant type */
async function fetchByKeyword(keyword: string): Promise<any[]> {
    try {
        const resp = await googleClient.placesNearby({
            params: {
                location: [CENTER.lat, CENTER.lng],
                radius: RADIUS_METERS,
                type: PlaceType1.restaurant,
                keyword,
                key: GOOGLE_PLACES_API_KEY as string,
            },
        });
        return resp.data.results || [];
    } catch {
        return [];
    }
}

/** Fetch all existing place IDs from Firestore */
async function getExistingPlaceIds(): Promise<Set<string>> {
    const snap = await db.collection('places').select().get(); // .select() fetches only IDs (no fields)
    return new Set(snap.docs.map(d => d.id));
}

interface Candidate {
    place_id: string;
    name: string;
    rating: number;
    user_ratings_total: number;
    price_level: number | undefined;
    priceRange: string | null;
    address: string;
    lat: number;
    lng: number;
    types: string[];
    openingHours: any;
    photoUrl: string | null;
    category: string;
    allowedActivities: string[];
}

/** Fetch details and build a Candidate, returns null if unusable */
async function buildCandidate(placeId: string, basicResult: any): Promise<Candidate | null> {
    const resp = await googleClient.placeDetails({
        params: {
            place_id: placeId,
            fields: ['name', 'formatted_address', 'geometry', 'opening_hours', 'price_level', 'photos', 'types', 'rating', 'user_ratings_total'],
            key: GOOGLE_PLACES_API_KEY as string,
        },
    });
    const d = resp.data.result;
    if (!d?.geometry?.location) return null;

    const price_level = d.price_level;
    const nameLower = (d.name || '').toLowerCase();

    // Exclude price_level 3+ (over $50)
    if (price_level !== undefined && price_level !== null && price_level > MAX_PRICE_LEVEL) return null;

    // Exclude places whose names signal expensive dining even when price_level is absent
    if (EXPENSIVE_NAME_KEYWORDS.some(kw => nameLower.includes(kw))) return null;

    const lat = d.geometry.location.lat as number;
    const lng = d.geometry.location.lng as number;

    // Hard distance check — reject if outside the specified radius
    const distanceM = geofire.distanceBetween([CENTER.lat, CENTER.lng], [lat, lng]) * 1000;
    if (distanceM > RADIUS_METERS) return null;

    const types = d.types || [];
    const category = mapTypeToCategory(types);
    const openingHours = d.opening_hours
        ? { periods: d.opening_hours.periods || [], weekday_text: d.opening_hours.weekday_text || [] }
        : null;

    let photoUrl: string | null = null;
    if (d.photos?.length) {
        photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${d.photos[0].photo_reference}&key=${GOOGLE_PLACES_API_KEY}`;
    }

    return {
        place_id: placeId,
        name: d.name || basicResult.name || 'Unknown',
        rating: d.rating ?? basicResult.rating ?? 0,
        user_ratings_total: d.user_ratings_total ?? basicResult.user_ratings_total ?? 0,
        price_level,
        priceRange: price_level !== undefined && price_level !== null ? (PRICE_RANGE_MAP[price_level] ?? null) : null,
        address: d.formatted_address || basicResult.vicinity || '',
        lat, lng, types,
        openingHours,
        photoUrl,
        category,
        allowedActivities: determineActivities(category, openingHours),
    };
}

/** Write one candidate to Firestore */
async function seedCandidate(c: Candidate): Promise<void> {
    const geohash = geofire.geohashForLocation([c.lat, c.lng]);
    await db.collection('places').doc(c.place_id).set({
        name: c.name,
        category: c.category,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        geohash,
        tags: c.types.filter(t => !['establishment', 'point_of_interest', 'food', 'store'].includes(t)).slice(0, 4),
        rawTypes: c.types,
        allowedActivities: c.allowedActivities,
        active: true,
        priceRange: c.priceRange,
        priceLevel: c.price_level ?? null,
        photoUrl: c.photoUrl,
        openingHours: c.openingHours,
        rating: c.rating,
        userRatingsTotal: c.user_ratings_total,
        source: 'seeded',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(DRY_RUN
        ? '🔍  DRY RUN — no data will be written to Firestore'
        : '🌱  SEED MODE — writing to Firestore');
    console.log(`📍  Center: Washington Square (${CENTER.lat}, ${CENTER.lng})`);
    console.log(`📏  Radius: ${RADIUS_METERS / 1000}km   Max price level: ${MAX_PRICE_LEVEL} (≤ $${MAX_PRICE_LEVEL === 2 ? '50' : '20'})`);
    console.log(`${'═'.repeat(60)}\n`);

    console.log('📂  Loading existing place IDs from Firestore…');
    const existingIds = await getExistingPlaceIds();
    console.log(`   Found ${existingIds.size} existing places in DB.\n`);

    // ── Phase 1: collect restaurant candidates ────────────────────────────────
    console.log('🍽️   Phase 1 — Restaurants (Lunch / Dinner)');
    console.log('   Fetching from Google Places API…');

    const rawRestaurants = new Map<string, any>();

    // By type (restaurant, meal_takeaway, meal_delivery)
    for (const type of RESTAURANT_TYPES) {
        process.stdout.write(`   type=${type}… `);
        const nearby = await fetchAllNearby(type);
        let added = 0;
        for (const p of nearby) {
            if (p.place_id && !rawRestaurants.has(p.place_id)) { rawRestaurants.set(p.place_id, p); added++; }
        }
        console.log(`${nearby.length} results, ${added} new unique`);
    }

    // By cuisine keyword (each call returns up to 20 fresh results)
    console.log(`   Searching ${RESTAURANT_KEYWORDS.length} cuisine keywords…`);
    let kwAdded = 0;
    for (const kw of RESTAURANT_KEYWORDS) {
        const nearby = await fetchByKeyword(kw);
        for (const p of nearby) {
            if (p.place_id && !rawRestaurants.has(p.place_id)) { rawRestaurants.set(p.place_id, p); kwAdded++; }
        }
        await new Promise(r => setTimeout(r, 300)); // gentle pacing
    }
    console.log(`   Keyword searches added ${kwAdded} additional unique places`);
    console.log(`   Total raw candidates from API: ${rawRestaurants.size}`);

    const newRestaurantIds = [...rawRestaurants.keys()].filter(id => !existingIds.has(id));
    console.log(`   Not yet in DB: ${newRestaurantIds.length}`);

    // Sort by rating desc (basic result has rating)
    newRestaurantIds.sort((a, b) => (rawRestaurants.get(b)?.rating ?? 0) - (rawRestaurants.get(a)?.rating ?? 0));

    // Fetch details and filter by price — check enough candidates to fill target + buffer
    const restaurantCandidates: Candidate[] = [];
    let restaurantNoPriceCount = 0;
    let restaurantSkippedExpensive = 0;
    const detailCap = Math.min(newRestaurantIds.length, TARGET_RESTAURANT * 3); // fetch 3× target as buffer

    console.log(`   Fetching details for up to ${detailCap} candidates…`);
    for (const id of newRestaurantIds.slice(0, detailCap)) {
        const c = await buildCandidate(id, rawRestaurants.get(id));
        if (!c) continue;
        if (c.price_level === undefined || c.price_level === null) {
            restaurantNoPriceCount++;
            restaurantCandidates.push(c);
        } else if (c.price_level > MAX_PRICE_LEVEL) {
            restaurantSkippedExpensive++;
        } else {
            restaurantCandidates.push(c);
        }
        if (restaurantCandidates.length >= TARGET_RESTAURANT + 15) break; // stop early if well over target
    }

    // Re-sort by rating
    restaurantCandidates.sort((a, b) => b.rating - a.rating);
    const restaurantFinal = restaurantCandidates.slice(0, TARGET_RESTAURANT);

    console.log(`\n   ── Restaurant summary ──`);
    console.log(`   Valid candidates found   : ${restaurantCandidates.length}`);
    console.log(`   Skipped (too expensive)  : ${restaurantSkippedExpensive}`);
    console.log(`   No price data (included) : ${restaurantNoPriceCount}`);
    console.log(`   Will seed                : ${restaurantFinal.length} / ${TARGET_RESTAURANT} target`);

    // ── Phase 2: collect drink candidates ─────────────────────────────────────
    console.log('\n☕  Phase 2 — Drink places (Cafe/Tea / Bar)');
    console.log('   Fetching from Google Places API…');

    const rawDrink = new Map<string, any>();
    for (const type of DRINK_TYPES) {
        const nearby = await fetchAllNearby(type);
        for (const p of nearby) {
            if (p.place_id && !rawDrink.has(p.place_id)) rawDrink.set(p.place_id, p);
        }
    }
    console.log(`   Raw candidates from API: ${rawDrink.size}`);

    const newDrinkIds = [...rawDrink.keys()].filter(id => !existingIds.has(id) && !rawRestaurants.has(id));
    console.log(`   Not yet in DB (excl. restaurants above): ${newDrinkIds.length}`);

    newDrinkIds.sort((a, b) => (rawDrink.get(b)?.rating ?? 0) - (rawDrink.get(a)?.rating ?? 0));

    const drinkCandidates: Candidate[] = [];
    let drinkNoPriceCount = 0;
    let drinkSkippedExpensive = 0;

    console.log(`   Fetching details for up to ${Math.min(newDrinkIds.length, 50)} candidates…`);
    for (const id of newDrinkIds.slice(0, 50)) {
        const c = await buildCandidate(id, rawDrink.get(id));
        if (!c) continue;
        if (c.price_level === undefined || c.price_level === null) {
            drinkNoPriceCount++;
            drinkCandidates.push(c);
        } else if (c.price_level > MAX_PRICE_LEVEL) {
            drinkSkippedExpensive++;
        } else {
            drinkCandidates.push(c);
        }
        if (drinkCandidates.length >= TARGET_DRINK + 10) break;
    }

    drinkCandidates.sort((a, b) => b.rating - a.rating);
    const drinkFinal = drinkCandidates.slice(0, TARGET_DRINK);

    console.log(`\n   ── Drink summary ──`);
    console.log(`   Valid candidates found   : ${drinkCandidates.length}`);
    console.log(`   Skipped (too expensive)  : ${drinkSkippedExpensive}`);
    console.log(`   No price data (included) : ${drinkNoPriceCount}`);
    console.log(`   Will seed                : ${drinkFinal.length} / ${TARGET_DRINK} target`);

    // ── Final check ───────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(60)}`);
    const restaurantOk = restaurantFinal.length >= TARGET_RESTAURANT;
    const drinkOk      = drinkFinal.length      >= TARGET_DRINK;

    if (!restaurantOk || !drinkOk) {
        console.log('⚠️   NOT ENOUGH PLACES FOUND:');
        if (!restaurantOk) console.log(`   • Restaurants: only ${restaurantFinal.length} found, need ${TARGET_RESTAURANT}`);
        if (!drinkOk)      console.log(`   • Drink:       only ${drinkFinal.length} found, need ${TARGET_DRINK}`);
        console.log('\n   ✋ Aborting. Please review and adjust targets or expand radius before seeding.');
        console.log(`${'─'.repeat(60)}\n`);
        process.exit(0);
    }

    // ── Preview top-10 of each ────────────────────────────────────────────────
    console.log('\n🏆  Top-10 Restaurant candidates (by rating):');
    restaurantFinal.slice(0, 10).forEach((c, i) =>
        console.log(`   ${(i + 1).toString().padStart(2)}. [${c.rating}⭐ ${c.user_ratings_total}★] ${c.price_level !== undefined ? PRICE_RANGE_MAP[c.price_level] ?? 'no price' : 'no price'}  ${c.name}`)
    );

    console.log('\n🏆  Top-10 Drink candidates (by rating):');
    drinkFinal.slice(0, 10).forEach((c, i) =>
        console.log(`   ${(i + 1).toString().padStart(2)}. [${c.rating}⭐ ${c.user_ratings_total}★] ${c.price_level !== undefined ? PRICE_RANGE_MAP[c.price_level] ?? 'no price' : 'no price'}  ${c.name}`)
    );

    if (DRY_RUN) {
        console.log(`\n${'═'.repeat(60)}`);
        console.log('✅  DRY RUN complete — targets met.');
        console.log(`   ${restaurantFinal.length} restaurants + ${drinkFinal.length} drink places ready.`);
        console.log('   Run with SEED=true to write to Firestore:');
        console.log('   SEED=true tsx scripts/seed-targeted.ts');
        console.log(`${'═'.repeat(60)}\n`);
        process.exit(0);
    }

    // ── Seed ─────────────────────────────────────────────────────────────────
    console.log('\n💾  Seeding restaurants…');
    let rAdded = 0;
    for (const c of restaurantFinal) {
        await seedCandidate(c);
        rAdded++;
        process.stdout.write(`\r   ${rAdded}/${restaurantFinal.length}`);
    }
    console.log(`\n   ✅ ${rAdded} restaurants seeded.`);

    console.log('\n💾  Seeding drink places…');
    let dAdded = 0;
    for (const c of drinkFinal) {
        await seedCandidate(c);
        dAdded++;
        process.stdout.write(`\r   ${dAdded}/${drinkFinal.length}`);
    }
    console.log(`\n   ✅ ${dAdded} drink places seeded.`);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🎉  Done! Seeded ${rAdded + dAdded} new places total.`);
    console.log(`${'═'.repeat(60)}\n`);
}

run().then(() => process.exit(0)).catch(err => {
    console.error('\n❌  Fatal error:', err);
    process.exit(1);
});
