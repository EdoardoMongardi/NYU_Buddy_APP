import * as admin from 'firebase-admin';
import { resolveMatchPlaceInternal } from './resolvePlace';

/**
 * Scheduled function to resolve expired location decisions.
 * PRD v2.4: Runs every minute to guarantee expiry resolution.
 * 
 * Usage: Export as onSchedule in index.ts
 */
export async function matchResolveExpiredHandler(): Promise<void> {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // Query matches that are still in location_deciding and past expiry
    const expiredMatches = await db
        .collection('matches')
        .where('status', '==', 'location_deciding')
        .where('locationDecision.expiresAt', '<=', now)
        .limit(50) // Process in batches
        .get();

    if (expiredMatches.empty) {
        console.log('[matchResolveExpired] No expired matches to resolve');
        return;
    }

    console.log(`[matchResolveExpired] Found ${expiredMatches.size} expired matches`);

    // Resolve each match
    const resolvePromises = expiredMatches.docs.map(async (doc) => {
        try {
            await resolveMatchPlaceInternal(db, doc.id);
            console.log(`[matchResolveExpired] Resolved match ${doc.id}`);
        } catch (error) {
            console.error(`[matchResolveExpired] Failed to resolve ${doc.id}:`, error);
        }
    });

    await Promise.all(resolvePromises);

    console.log(`[matchResolveExpired] Completed resolving ${expiredMatches.size} matches`);
}
