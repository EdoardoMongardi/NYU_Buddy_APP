/**
 * One-time migration: Update existing places collection for the activity overhaul.
 *
 * Changes:
 *   1. Replace "Coffee" with "Drink" in allowedActivities
 *   2. Remove "Study" from Cafe/Tea places' allowedActivities
 *   3. Remove "Lunch" from Cafe/Tea places' allowedActivities
 *   4. Add "Hangout" to Park places' allowedActivities (if not present)
 *   5. Add "Hangout" to places with empty allowedActivities or category "Other"
 *   6. For restaurants with openingHours, re-derive Lunch/Dinner from opening hours
 *
 * Run with: npx ts-node scripts/migrate-activities.ts
 */

import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

if (!admin.apps.length) {
    admin.initializeApp();
}

interface OpeningHours {
    periods: {
        open?: { day: number; time: string };
        close?: { day: number; time: string };
    }[];
    weekday_text: string[];
}

function determineRestaurantActivities(openingHours?: OpeningHours | null): string[] {
    if (!openingHours || !openingHours.periods || openingHours.periods.length === 0) {
        return ['Lunch', 'Dinner'];
    }

    let servesLunch = false;
    let servesDinner = false;

    for (const period of openingHours.periods) {
        if (period.open && period.close) {
            const openTime = parseInt(period.open.time, 10);
            const closeTime = parseInt(period.close.time, 10);

            if (openTime <= 1400 && closeTime >= 1100) servesLunch = true;
            if (openTime <= 2000 && closeTime >= 1700) servesDinner = true;
        } else if (period.open && period.open.day === 0 && period.open.time === '0000' && !period.close) {
            servesLunch = true;
            servesDinner = true;
        }
    }

    const activities: string[] = [];
    if (servesLunch) activities.push('Lunch');
    if (servesDinner) activities.push('Dinner');
    return activities.length > 0 ? activities : ['Dinner'];
}

async function migrate() {
    const db = admin.firestore();
    const placesRef = db.collection('places');
    const snapshot = await placesRef.get();

    console.log(`Found ${snapshot.size} places to process.\n`);

    let updated = 0;
    let skipped = 0;

    const batch = db.batch();
    const MAX_BATCH = 500;
    let batchCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const category: string = data.category || 'Other';
        const currentActivities: string[] = data.allowedActivities || [];
        const openingHours: OpeningHours | null = data.openingHours || null;
        let newActivities: string[];

        switch (category) {
            case 'Cafe':
            case 'Cafe/Tea':
                newActivities = ['Drink'];
                break;
            case 'Restaurant':
                newActivities = determineRestaurantActivities(openingHours);
                break;
            case 'Library':
            case 'Study Space':
                newActivities = ['Study'];
                break;
            case 'Park':
                newActivities = ['Walk', 'Hangout'];
                break;
            default:
                newActivities = ['Hangout'];
                break;
        }

        // Also update old "Cafe" category name to "Cafe/Tea"
        const newCategory = category === 'Cafe' ? 'Cafe/Tea' : category;

        const activitiesChanged = JSON.stringify(currentActivities.sort()) !== JSON.stringify(newActivities.sort());
        const categoryChanged = newCategory !== category;

        if (!activitiesChanged && !categoryChanged) {
            skipped++;
            continue;
        }

        const updateData: Record<string, unknown> = {
            allowedActivities: newActivities,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (categoryChanged) {
            updateData.category = newCategory;
        }

        batch.update(doc.ref, updateData);
        batchCount++;
        updated++;

        const changes: string[] = [];
        if (activitiesChanged) changes.push(`activities: [${currentActivities}] -> [${newActivities}]`);
        if (categoryChanged) changes.push(`category: ${category} -> ${newCategory}`);
        console.log(`  ${doc.id} (${data.name}): ${changes.join(', ')}`);

        if (batchCount >= MAX_BATCH) {
            await batch.commit();
            console.log(`\n  Committed batch of ${batchCount} updates.`);
            batchCount = 0;
        }
    }

    if (batchCount > 0) {
        await batch.commit();
    }

    console.log(`\nDone. Updated: ${updated}, Skipped (no change): ${skipped}`);
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
