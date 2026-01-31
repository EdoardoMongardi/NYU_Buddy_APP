/**
 * getCycleSuggestion - Cycle-based suggestion browsing
 * Replaces cooldown-based getTop1 with cycle-through-all approach
 * 
 * Behavior:
 * - First call: Build candidate list, store as currentCycle
 * - Subsequent calls: Return next candidate from cycle
 * - Cycle end: Refresh pool, re-rank, deprioritize expired-offer users
 * - Persistence: <30min offline → restore, >30min → reset
 */

import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as geofire from 'geofire-common';

// Configuration
const CYCLE_PERSIST_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const REJECTION_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CANDIDATES_PER_RADIUS = 50;
const RADIUS_KM = 5; // Fixed 5km radius for cycle

// Scoring weights
const WEIGHTS = {
    distance: 0.40,
    interests: 0.15,
    duration: 0.20,
    reliability: 0.10,
    fairness: 0.10,
    urgency: 0.05,
};

interface Candidate {
    uid: string;
    distance: number;
    activity: string;
    durationMinutes: number;
    interests: string[];
    lat: number;
    lng: number;
    meetRate?: number;
    cancelRate?: number;
    exposureScore?: number;
    expiresAt?: admin.firestore.Timestamp;
    score?: number;
}

interface CycleState {
    candidateUids: string[];
    currentIndex: number;
    startedAt: admin.firestore.Timestamp;
    lastSeenAt: admin.firestore.Timestamp;
}

interface GetSuggestionData {
    action?: 'next' | 'refresh'; // 'next' = get next in cycle, 'refresh' = force new cycle
}

// Calculate distance score (bucketed)
function calculateDistanceScore(distanceMeters: number): number {
    if (distanceMeters <= 200) return 1.0;
    if (distanceMeters <= 500) return 0.8;
    if (distanceMeters <= 800) return 0.5;
    if (distanceMeters <= 1000) return 0.2;
    return Math.max(0, 1 - distanceMeters / 5000);
}

// Calculate interest overlap score
function calculateInterestScore(
    userInterests: string[],
    candidateInterests: string[]
): number {
    const sharedCount = userInterests.filter((i) =>
        candidateInterests.includes(i)
    ).length;
    return Math.min(1, sharedCount / 3);
}

// Calculate duration compatibility score
function calculateDurationScore(
    userDuration: number,
    candidateDuration: number
): number {
    const diff = Math.abs(userDuration - candidateDuration);
    if (diff === 0) return 1.0;
    if (diff <= 30) return 0.7;
    if (diff <= 60) return 0.3;
    return 0;
}

// Calculate reliability score
function calculateReliabilityScore(
    meetRate: number = 0.5,
    cancelRate: number = 0
): number {
    const score = 0.5 + 0.5 * meetRate - 0.3 * cancelRate;
    return Math.max(0, Math.min(1, score));
}

// Calculate fairness score
function calculateFairnessScore(exposureScore: number = 0): number {
    return Math.max(0.2, 1 - exposureScore * 0.1);
}

// Calculate urgency score
function calculateUrgencyScore(
    expiresAt: admin.firestore.Timestamp | undefined,
    now: admin.firestore.Timestamp
): number {
    if (!expiresAt) return 0.5;
    const remainingMs = expiresAt.toMillis() - now.toMillis();
    const remainingMinutes = remainingMs / (60 * 1000);
    if (remainingMinutes <= 15) return 1.0;
    if (remainingMinutes <= 30) return 0.8;
    if (remainingMinutes <= 60) return 0.5;
    return 0.3;
}

// Generate explanation
function generateExplanation(
    candidate: Candidate,
    sharedInterests: string[]
): string {
    if (candidate.distance <= 200) return '~2-3 min walk away';
    if (candidate.distance <= 500) return '~5-7 min walk away';
    if (candidate.distance <= 800) return '~8-10 min walk away';
    if (sharedInterests.length >= 1) {
        return `You both like ${sharedInterests.slice(0, 2).join(' and ')}`;
    }
    return `Available for ${candidate.activity}`;
}

/**
 * Fetch and filter all candidates, then rank them
 */
async function fetchAndRankCandidates(
    db: admin.firestore.Firestore,
    uid: string,
    presence: admin.firestore.DocumentData,
    recentlyExpiredOfferUids: Set<string>
): Promise<Candidate[]> {
    const now = admin.firestore.Timestamp.now();
    const { lat, lng, activity, durationMinutes } = presence;

    // Get user's interests
    const userDoc = await db.collection('users').doc(uid).get();
    const userInterests: string[] = userDoc.exists
        ? userDoc.data()!.interests || []
        : [];

    // Get blocked users (both directions)
    const blockedSnapshot = await db
        .collection('blocks')
        .doc(uid)
        .collection('blocked')
        .get();
    const blockedUids = new Set(blockedSnapshot.docs.map((doc) => doc.id));

    // Get rejection cooldowns (6h mutual)
    const cooldownDate = new Date(Date.now() - REJECTION_COOLDOWN_MS);
    const rejectionsFromMe = await db
        .collection('suggestions')
        .where('fromUid', '==', uid)
        .where('action', '==', 'reject')
        .where('createdAt', '>', admin.firestore.Timestamp.fromDate(cooldownDate))
        .get();
    const rejectionsToMe = await db
        .collection('suggestions')
        .where('toUid', '==', uid)
        .where('action', '==', 'reject')
        .where('createdAt', '>', admin.firestore.Timestamp.fromDate(cooldownDate))
        .get();

    const rejectionCooldownUids = new Set([
        ...rejectionsFromMe.docs.map((doc) => doc.data().toUid),
        ...rejectionsToMe.docs.map((doc) => doc.data().fromUid),
    ]);

    // Get active matches
    const matchesAsUser1 = await db
        .collection('matches')
        .where('user1Uid', '==', uid)
        .where('status', 'in', ['pending', 'location_deciding', 'place_confirmed', 'in_meetup'])
        .get();
    const matchesAsUser2 = await db
        .collection('matches')
        .where('user2Uid', '==', uid)
        .where('status', 'in', ['pending', 'location_deciding', 'place_confirmed', 'in_meetup'])
        .get();
    const matchedUids = new Set([
        ...matchesAsUser1.docs.map((doc) => doc.data().user2Uid),
        ...matchesAsUser2.docs.map((doc) => doc.data().user1Uid),
    ]);

    // Get my active outgoing offers (to exclude from suggestions)
    const myActiveOffers = await db
        .collection('offers')
        .where('fromUid', '==', uid)
        .where('status', '==', 'pending')
        .where('expiresAt', '>', now)
        .get();
    const activeOfferTargetUids = new Set(
        myActiveOffers.docs.map((doc) => doc.data().toUid)
    );

    // Get users who have pending offers to me (show in Inbox instead)
    const pendingOffersToMe = await db
        .collection('offers')
        .where('toUid', '==', uid)
        .where('status', '==', 'pending')
        .where('expiresAt', '>', now)
        .get();
    const usersWithPendingOffers = new Set(
        pendingOffersToMe.docs.map((doc) => doc.data().fromUid)
    );

    // Query nearby presences
    const radiusInM = RADIUS_KM * 1000;
    const center: [number, number] = [lat, lng];
    const bounds = geofire.geohashQueryBounds(center, radiusInM);

    const candidatePromises = bounds.map((b) =>
        db
            .collection('presence')
            .where('status', '==', 'available')
            .orderBy('geohash')
            .startAt(b[0])
            .endAt(b[1])
            .limit(MAX_CANDIDATES_PER_RADIUS)
            .get()
    );

    const snapshots = await Promise.all(candidatePromises);

    // Filter candidates
    const candidates: Candidate[] = [];
    const seenDocIds = new Set<string>();

    for (const snap of snapshots) {
        for (const doc of snap.docs) {
            // Skip duplicates from overlapping geohash bounds
            if (seenDocIds.has(doc.id)) continue;
            seenDocIds.add(doc.id);

            const data = doc.data();

            // Hard filters
            if (doc.id === uid) continue; // Self
            if (data.expiresAt.toMillis() < now.toMillis()) continue; // Expired
            if (blockedUids.has(doc.id)) continue; // Blocked by me
            if (rejectionCooldownUids.has(doc.id)) continue; // Rejection cooldown
            if (matchedUids.has(doc.id)) continue; // Already matched
            if (activeOfferTargetUids.has(doc.id)) continue; // Already sent offer
            if (usersWithPendingOffers.has(doc.id)) continue; // They have offer to me
            if (data.activity !== activity) continue; // Different activity

            // Check symmetric block (they blocked me)
            const theyBlockedMe = await db
                .collection('blocks')
                .doc(doc.id)
                .collection('blocked')
                .doc(uid)
                .get();
            if (theyBlockedMe.exists) continue;

            // Duration check
            const durationDiff = Math.abs(
                (data.durationMinutes || 60) - (durationMinutes || 60)
            );
            if (durationDiff > 60) continue;

            // Calculate distance
            const distanceInKm = geofire.distanceBetween(
                [lat, lng],
                [data.lat, data.lng]
            );
            const distanceInM = distanceInKm * 1000;
            if (distanceInM > radiusInM) continue;

            // Get interests
            const candidateUserDoc = await db.collection('users').doc(doc.id).get();
            const candidateInterests: string[] = candidateUserDoc.exists
                ? candidateUserDoc.data()!.interests || []
                : [];

            // Calculate score
            const distanceScore = calculateDistanceScore(distanceInM);
            const interestScore = calculateInterestScore(userInterests, candidateInterests);
            const durationScore = calculateDurationScore(durationMinutes || 60, data.durationMinutes || 60);
            const reliabilityScore = calculateReliabilityScore(data.meetRate, data.cancelRate);
            const fairnessScore = calculateFairnessScore(data.exposureScore);
            const urgencyScore = calculateUrgencyScore(data.expiresAt, now);

            let totalScore =
                WEIGHTS.distance * distanceScore +
                WEIGHTS.interests * interestScore +
                WEIGHTS.duration * durationScore +
                WEIGHTS.reliability * reliabilityScore +
                WEIGHTS.fairness * fairnessScore +
                WEIGHTS.urgency * urgencyScore;

            // Deprioritize recently expired offers (push to back)
            if (recentlyExpiredOfferUids.has(doc.id)) {
                totalScore -= 0.5; // Significant penalty
            }

            candidates.push({
                uid: doc.id,
                distance: Math.round(distanceInM),
                activity: data.activity,
                durationMinutes: data.durationMinutes || 60,
                interests: candidateInterests,
                lat: data.lat,
                lng: data.lng,
                meetRate: data.meetRate,
                cancelRate: data.cancelRate,
                exposureScore: data.exposureScore || 0,
                expiresAt: data.expiresAt,
                score: totalScore,
            });
        }
    }

    // Sort by score descending
    candidates.sort((a, b) => (b.score || 0) - (a.score || 0));

    console.log(`[getCycleSuggestion] Found ${candidates.length} candidates for cycle`);

    return candidates;
}

/**
 * Main handler
 */
export async function suggestionGetCycleHandler(
    request: CallableRequest<GetSuggestionData>
) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    const { action } = request.data || {};

    // Get presence
    const presenceRef = db.collection('presence').doc(uid);
    const presenceDoc = await presenceRef.get();

    if (!presenceDoc.exists) {
        throw new HttpsError('failed-precondition', 'You must set your availability first');
    }

    const presence = presenceDoc.data()!;
    const now = admin.firestore.Timestamp.now();

    // Check if presence expired
    if (presence.expiresAt.toMillis() < now.toMillis()) {
        await presenceRef.delete();
        throw new HttpsError('failed-precondition', 'Your availability has expired');
    }

    // Get current cycle state
    let currentCycle: CycleState | null = presence.currentCycle || null;
    const recentlyExpiredOfferUids = new Set<string>(presence.recentlyExpiredOfferUids || []);

    // Check if cycle should be reset
    let shouldResetCycle = action === 'refresh';

    if (currentCycle) {
        const timeSinceLastSeen = now.toMillis() - currentCycle.lastSeenAt.toMillis();
        if (timeSinceLastSeen > CYCLE_PERSIST_THRESHOLD_MS) {
            console.log(`[getCycleSuggestion] Cycle expired (${timeSinceLastSeen}ms > ${CYCLE_PERSIST_THRESHOLD_MS}ms)`);
            shouldResetCycle = true;
        }
    } else {
        // No cycle exists, create new one
        shouldResetCycle = true;
    }

    // Build new cycle if needed
    if (shouldResetCycle) {
        console.log(`[getCycleSuggestion] Building new cycle for ${uid}`);
        const candidates = await fetchAndRankCandidates(db, uid, presence, recentlyExpiredOfferUids);

        if (candidates.length === 0) {
            // Clear cycle and return no suggestion
            await presenceRef.update({
                currentCycle: admin.firestore.FieldValue.delete(),
                recentlyExpiredOfferUids: [], // Clear expired list on new cycle
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
                suggestion: null,
                cycleInfo: { total: 0, current: 0, isNewCycle: true },
                message: 'No one nearby right now. Try again later.',
            };
        }

        currentCycle = {
            candidateUids: candidates.map((c) => c.uid),
            currentIndex: 0,
            startedAt: now,
            lastSeenAt: now,
        };

        await presenceRef.update({
            currentCycle,
            recentlyExpiredOfferUids: [], // Clear expired list on new cycle
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    // Get current candidate UID
    const candidateUids = currentCycle!.candidateUids;
    let currentIndex = currentCycle!.currentIndex;

    // Filter out candidates who are no longer valid (offline, matched, blocked, have active offer)
    let validCandidateUid: string | null = null;
    let skippedCount = 0;
    const maxSkips = candidateUids.length;

    while (skippedCount < maxSkips) {
        const candidateUid = candidateUids[currentIndex % candidateUids.length];

        // Quick validation check
        const isValid = await validateCandidate(db, uid, candidateUid, presence.activity);

        if (isValid) {
            validCandidateUid = candidateUid;
            break;
        }

        // Skip to next
        currentIndex++;
        skippedCount++;

        // Check if we've wrapped around (end of cycle)
        if (currentIndex >= candidateUids.length) {
            console.log(`[getCycleSuggestion] Reached end of cycle, refreshing...`);
            // Trigger new cycle on next call
            const candidates = await fetchAndRankCandidates(db, uid, presence, recentlyExpiredOfferUids);

            if (candidates.length === 0) {
                await presenceRef.update({
                    currentCycle: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return {
                    suggestion: null,
                    cycleInfo: { total: 0, current: 0, isNewCycle: true, isCycleEnd: true },
                    message: 'You\'ve seen everyone available. Looking for more people...',
                };
            }

            // Start new cycle
            currentCycle = {
                candidateUids: candidates.map((c) => c.uid),
                currentIndex: 0,
                startedAt: now,
                lastSeenAt: now,
            };
            currentIndex = 0;
            validCandidateUid = candidates[0].uid;

            await presenceRef.update({
                currentCycle,
                recentlyExpiredOfferUids: [],
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            break;
        }
    }

    if (!validCandidateUid) {
        return {
            suggestion: null,
            cycleInfo: { total: candidateUids.length, current: currentIndex, isNewCycle: false },
            message: 'No one available right now. Try again later.',
        };
    }

    // Update cycle state
    await presenceRef.update({
        'currentCycle.currentIndex': currentIndex,
        'currentCycle.lastSeenAt': now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Build suggestion response
    const candidatePresence = await db.collection('presence').doc(validCandidateUid).get();
    const candidateUser = await db.collection('users').doc(validCandidateUid).get();

    if (!candidatePresence.exists || !candidateUser.exists) {
        // Edge case: user disappeared, try next
        return suggestionGetCycleHandler(request);
    }

    const candidateData = candidatePresence.data()!;
    const userData = candidateUser.data()!;
    const userDoc = await db.collection('users').doc(uid).get();
    const userInterests: string[] = userDoc.exists ? userDoc.data()!.interests || [] : [];

    const distanceInKm = geofire.distanceBetween(
        [presence.lat, presence.lng],
        [candidateData.lat, candidateData.lng]
    );
    const distanceInM = Math.round(distanceInKm * 1000);

    const sharedInterests = userInterests.filter((i) =>
        (userData.interests || []).includes(i)
    );

    const explanation = generateExplanation(
        {
            uid: validCandidateUid,
            distance: distanceInM,
            activity: candidateData.activity,
            durationMinutes: candidateData.durationMinutes,
            interests: userData.interests || [],
            lat: candidateData.lat,
            lng: candidateData.lng,
        },
        sharedInterests
    );

    return {
        suggestion: {
            uid: validCandidateUid,
            displayName: userData.displayName || 'NYU Student',
            photoURL: userData.photoURL || null,
            interests: userData.interests || [],
            activity: candidateData.activity,
            distance: distanceInM,
            durationMinutes: candidateData.durationMinutes || 60,
            explanation,
        },
        cycleInfo: {
            total: currentCycle!.candidateUids.length,
            current: currentIndex + 1, // 1-indexed for display
            isNewCycle: shouldResetCycle,
        },
    };
}

/**
 * Quick validation to check if candidate is still valid
 */
async function validateCandidate(
    db: admin.firestore.Firestore,
    myUid: string,
    candidateUid: string,
    myActivity: string
): Promise<boolean> {
    const now = admin.firestore.Timestamp.now();

    // Check presence exists and is available
    const presenceDoc = await db.collection('presence').doc(candidateUid).get();
    if (!presenceDoc.exists) return false;

    const data = presenceDoc.data()!;
    if (data.status !== 'available') return false;
    if (data.expiresAt.toMillis() < now.toMillis()) return false;
    if (data.activity !== myActivity) return false;

    // Check I don't already have an active offer to them
    const myOffers = await db
        .collection('offers')
        .where('fromUid', '==', myUid)
        .where('toUid', '==', candidateUid)
        .where('status', '==', 'pending')
        .where('expiresAt', '>', now)
        .limit(1)
        .get();
    if (!myOffers.empty) return false;

    return true;
}

/**
 * Handler to advance to next candidate in cycle (called on Pass)
 */
export async function suggestionPassHandler(
    request: CallableRequest<{ targetUid: string }>
) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    const presenceRef = db.collection('presence').doc(uid);
    const presenceDoc = await presenceRef.get();

    if (!presenceDoc.exists) {
        throw new HttpsError('failed-precondition', 'No active session');
    }

    const presence = presenceDoc.data()!;
    const currentCycle = presence.currentCycle;

    if (!currentCycle) {
        throw new HttpsError('failed-precondition', 'No active cycle');
    }

    // Advance index
    const newIndex = currentCycle.currentIndex + 1;
    const now = admin.firestore.Timestamp.now();

    await presenceRef.update({
        'currentCycle.currentIndex': newIndex,
        'currentCycle.lastSeenAt': now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, newIndex };
}
