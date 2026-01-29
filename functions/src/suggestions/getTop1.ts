import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as geofire from 'geofire-common';

// Configuration
const COOLDOWN_DAYS = 3;
const MAX_CANDIDATES_PER_RADIUS = 50;

// Scoring weights (updated for offer system)
const WEIGHTS = {
  distance: 0.40,
  interests: 0.15,
  duration: 0.20,
  reliability: 0.10,
  fairness: 0.10,  // Penalize over-exposed users
  urgency: 0.05,   // Boost soon-expiring users
};

// Dynamic radius tiers (in km)
const RADIUS_TIERS = [
  { maxWaitSeconds: 10, radiusKm: 1 },
  { maxWaitSeconds: 20, radiusKm: 2 },
  { maxWaitSeconds: 40, radiusKm: 3 },
  { maxWaitSeconds: Infinity, radiusKm: 5 },
];

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
}

interface ScoredCandidate extends Candidate {
  score: number;
  explanation: string;
  scores: {
    distance: number;
    interests: number;
    duration: number;
    reliability: number;
    fairness: number;
    urgency: number;
  };
}

// Calculate distance score (bucketed)
function calculateDistanceScore(distanceMeters: number): number {
  if (distanceMeters <= 200) return 1.0;
  if (distanceMeters <= 500) return 0.8;
  if (distanceMeters <= 800) return 0.5;
  if (distanceMeters <= 1000) return 0.2;
  // Linear falloff for expanded radius
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
  return 0; // Filtered out in hard filter, but just in case
}

// Calculate reliability score
function calculateReliabilityScore(
  meetRate: number = 0.5,
  cancelRate: number = 0
): number {
  const score = 0.5 + 0.5 * meetRate - 0.3 * cancelRate;
  return Math.max(0, Math.min(1, score));
}

// Calculate fairness score (penalize over-exposed users)
function calculateFairnessScore(exposureScore: number = 0): number {
  // Lower score for users who have been shown many times
  // exposureScore of 0-5 = good (1.0-0.5)
  // exposureScore of 5+ = diminishing returns
  return Math.max(0.2, 1 - exposureScore * 0.1);
}

// Calculate urgency score (boost users whose presence expires soon)
function calculateUrgencyScore(
  expiresAt: admin.firestore.Timestamp | undefined,
  now: admin.firestore.Timestamp
): number {
  if (!expiresAt) return 0.5;

  const remainingMs = expiresAt.toMillis() - now.toMillis();
  const remainingMinutes = remainingMs / (60 * 1000);

  // Users with less time remaining get higher urgency score
  // <15 min = 1.0, 15-30 min = 0.8, 30-60 min = 0.5, >60 min = 0.3
  if (remainingMinutes <= 15) return 1.0;
  if (remainingMinutes <= 30) return 0.8;
  if (remainingMinutes <= 60) return 0.5;
  return 0.3;
}

// Generate explanation based on top scoring factors
function generateExplanation(
  candidate: ScoredCandidate,
  sharedInterests: string[]
): string {
  const explanations: { score: number; text: string }[] = [];

  // Distance explanation
  if (candidate.distance <= 200) {
    explanations.push({ score: candidate.scores.distance, text: '~2-3 min walk away' });
  } else if (candidate.distance <= 500) {
    explanations.push({ score: candidate.scores.distance, text: '~5-7 min walk away' });
  } else if (candidate.distance <= 800) {
    explanations.push({ score: candidate.scores.distance, text: '~8-10 min walk away' });
  } else {
    explanations.push({ score: candidate.scores.distance, text: '~10-15 min walk away' });
  }

  // Interest explanation
  if (sharedInterests.length >= 2) {
    explanations.push({
      score: candidate.scores.interests + 0.1,
      text: `You both like ${sharedInterests.slice(0, 2).join(' and ')}`,
    });
  } else if (sharedInterests.length === 1) {
    explanations.push({
      score: candidate.scores.interests,
      text: `You both like ${sharedInterests[0]}`,
    });
  }

  // Duration explanation
  if (candidate.scores.duration === 1.0) {
    explanations.push({
      score: candidate.scores.duration,
      text: `Same ${candidate.activity.toLowerCase()} window`,
    });
  }

  // Sort by score and pick top explanation
  explanations.sort((a, b) => b.score - a.score);
  return explanations[0]?.text || `Available for ${candidate.activity}`;
}

// Get current search radius based on session start time
function getCurrentRadius(sessionStartTime: admin.firestore.Timestamp): number {
  const elapsedSeconds =
    (Date.now() - sessionStartTime.toMillis()) / 1000;

  for (const tier of RADIUS_TIERS) {
    if (elapsedSeconds <= tier.maxWaitSeconds) {
      return tier.radiusKm;
    }
  }
  return RADIUS_TIERS[RADIUS_TIERS.length - 1].radiusKm;
}

export async function suggestionGetTop1Handler(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;
  const db = admin.firestore();

  // Get current user's presence
  const presenceDoc = await db.collection('presence').doc(uid).get();

  if (!presenceDoc.exists) {
    throw new HttpsError(
      'failed-precondition',
      'You must set your availability first'
    );
  }

  const presence = presenceDoc.data()!;
  const now = admin.firestore.Timestamp.now();

  // Check if presence has expired
  if (presence.expiresAt.toMillis() < now.toMillis()) {
    await presenceDoc.ref.delete();
    throw new HttpsError('failed-precondition', 'Your availability has expired');
  }

  const { lat, lng, activity, durationMinutes, createdAt } = presence;
  const sessionStartTime = createdAt || now;

  // Get user's interests
  const userDoc = await db.collection('users').doc(uid).get();
  const userInterests: string[] = userDoc.exists
    ? userDoc.data()!.interests || []
    : [];

  // Get seen candidates in this session
  const seenCandidateIds: Set<string> = new Set(presence.seenCandidateIds || []);

  // Get users blocked by current user
  const blockedSnapshot = await db
    .collection('blocks')
    .doc(uid)
    .collection('blocked')
    .get();
  const blockedUids = new Set(blockedSnapshot.docs.map((doc) => doc.id));

  // Note: For MVP, we only check users WE blocked, not users who blocked US
  // To check reverse blocks, we'd need to store blockedUid as a field
  // and create a collection group index, or check each candidate individually

  // Get recent passes (within cooldown period)
  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);

  const passedSnapshot = await db
    .collection('suggestions')
    .where('fromUid', '==', uid)
    .where('action', '==', 'pass')
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(cooldownDate))
    .get();

  const recentlyPassedUids = new Set(
    passedSnapshot.docs.map((doc) => doc.data().toUid)
  );

  // Get existing active matches
  const matchesAsUser1 = await db
    .collection('matches')
    .where('user1Uid', '==', uid)
    .where('status', 'in', ['pending', 'heading_there', 'arrived'])
    .get();

  const matchesAsUser2 = await db
    .collection('matches')
    .where('user2Uid', '==', uid)
    .where('status', 'in', ['pending', 'heading_there', 'arrived'])
    .get();

  const matchedUids = new Set([
    ...matchesAsUser1.docs.map((doc) => doc.data().user2Uid),
    ...matchesAsUser2.docs.map((doc) => doc.data().user1Uid),
  ]);

  // Get users who have pending offers to current user (they should be in Inbox)
  const pendingOffersToMe = await db.collection('offers')
    .where('toUid', '==', uid)
    .where('status', '==', 'pending')
    .where('expiresAt', '>', now)
    .get();

  const usersWithPendingOffers = new Set(
    pendingOffersToMe.docs.map((doc) => doc.data().fromUid)
  );

  // Determine current search radius
  const currentRadiusKm = getCurrentRadius(sessionStartTime);
  const radiusInM = currentRadiusKm * 1000;

  // Get nearby presences using geohash
  const center: [number, number] = [lat, lng];
  const bounds = geofire.geohashQueryBounds(center, radiusInM);

  const candidatePromises: Promise<
    admin.firestore.QuerySnapshot<admin.firestore.DocumentData>
  >[] = [];

  for (const b of bounds) {
    // Geohash queries require geohash to be the range field
    // Filter expiresAt in memory after fetching
    const q = db
      .collection('presence')
      .where('status', '==', 'available')
      .orderBy('geohash')
      .startAt(b[0])
      .endAt(b[1])
      .limit(MAX_CANDIDATES_PER_RADIUS);
    candidatePromises.push(q.get());
  }

  const snapshots = await Promise.all(candidatePromises);

  // Debug logging
  let totalDocs = 0;
  for (const snap of snapshots) {
    totalDocs += snap.docs.length;
  }
  console.log(`[DEBUG] User ${uid} searching. Found ${totalDocs} presence docs in ${bounds.length} geohash bounds. Activity: ${activity}, Radius: ${currentRadiusKm}km`);

  // Apply hard filters and collect candidates
  const candidates: Candidate[] = [];
  const filterReasons: Record<string, number> = {};

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const data = doc.data();

      // Hard filter 1: Skip self
      if (doc.id === uid) {
        filterReasons['self'] = (filterReasons['self'] || 0) + 1;
        continue;
      }

      // Hard filter 2: Skip expired presences (filtered in memory since geohash uses the range)
      if (data.expiresAt.toMillis() < now.toMillis()) {
        filterReasons['expired'] = (filterReasons['expired'] || 0) + 1;
        continue;
      }

      // Hard filter 3: Skip blocked users
      if (blockedUids.has(doc.id)) {
        filterReasons['blocked'] = (filterReasons['blocked'] || 0) + 1;
        continue;
      }

      // Hard filter 4: Skip recently passed users
      if (recentlyPassedUids.has(doc.id)) {
        filterReasons['passed'] = (filterReasons['passed'] || 0) + 1;
        continue;
      }

      // Hard filter 5: Skip already matched users
      if (matchedUids.has(doc.id)) {
        filterReasons['matched'] = (filterReasons['matched'] || 0) + 1;
        continue;
      }

      // Hard filter 6: Skip seen candidates in this session
      if (seenCandidateIds.has(doc.id)) {
        filterReasons['seen'] = (filterReasons['seen'] || 0) + 1;
        continue;
      }

      // Hard filter 7: Skip users who have pending offers to me (show in Inbox instead)
      if (usersWithPendingOffers.has(doc.id)) {
        filterReasons['has_pending_offer'] = (filterReasons['has_pending_offer'] || 0) + 1;
        continue;
      }

      // Hard filter 8: Same activity
      if (data.activity !== activity) {
        filterReasons['activity'] = (filterReasons['activity'] || 0) + 1;
        console.log(`[DEBUG] Activity mismatch: user wants "${activity}", candidate ${doc.id} wants "${data.activity}"`);
        continue;
      }

      // Hard filter 9: Duration difference ≤ 60 minutes
      const durationDiff = Math.abs(
        (data.durationMinutes || 60) - (durationMinutes || 60)
      );
      if (durationDiff > 60) {
        filterReasons['duration'] = (filterReasons['duration'] || 0) + 1;
        continue;
      }

      // Calculate actual distance
      const candidateLat = data.lat;
      const candidateLng = data.lng;
      const distanceInKm = geofire.distanceBetween(
        [lat, lng],
        [candidateLat, candidateLng]
      );
      const distanceInM = distanceInKm * 1000;

      // Hard filter 10: Within current radius
      if (distanceInM > radiusInM) {
        filterReasons['distance'] = (filterReasons['distance'] || 0) + 1;
        console.log(`[DEBUG] Distance filter: candidate ${doc.id} is ${distanceInM}m away, radius is ${radiusInM}m`);
        continue;
      }

      // Get candidate's user profile for interests
      const candidateUserDoc = await db.collection('users').doc(doc.id).get();
      const candidateInterests: string[] = candidateUserDoc.exists
        ? candidateUserDoc.data()!.interests || []
        : [];

      candidates.push({
        uid: doc.id,
        distance: Math.round(distanceInM),
        activity: data.activity,
        durationMinutes: data.durationMinutes || 60,
        interests: candidateInterests,
        lat: candidateLat,
        lng: candidateLng,
        meetRate: data.meetRate,
        cancelRate: data.cancelRate,
        exposureScore: data.exposureScore || 0,
        expiresAt: data.expiresAt,
      });
    }
  }

  // Log filter summary
  console.log(`[DEBUG] Filter summary: ${JSON.stringify(filterReasons)}. Remaining candidates: ${candidates.length}`);

  // If no candidates after filtering
  if (candidates.length === 0) {
    return {
      suggestion: null,
      searchRadiusKm: currentRadiusKm,
      message: 'No one nearby right now. Try again later.',
    };
  }

  // Score candidates
  const scoredCandidates: ScoredCandidate[] = candidates.map((candidate) => {
    const distanceScore = calculateDistanceScore(candidate.distance);
    const interestScore = calculateInterestScore(userInterests, candidate.interests);
    const durationScore = calculateDurationScore(
      durationMinutes || 60,
      candidate.durationMinutes
    );
    const reliabilityScore = calculateReliabilityScore(
      candidate.meetRate,
      candidate.cancelRate
    );
    const fairnessScore = calculateFairnessScore(candidate.exposureScore);
    const urgencyScore = calculateUrgencyScore(candidate.expiresAt, now);

    const totalScore =
      WEIGHTS.distance * distanceScore +
      WEIGHTS.interests * interestScore +
      WEIGHTS.duration * durationScore +
      WEIGHTS.reliability * reliabilityScore +
      WEIGHTS.fairness * fairnessScore +
      WEIGHTS.urgency * urgencyScore;

    const sharedInterests = userInterests.filter((i) =>
      candidate.interests.includes(i)
    );

    const scored: ScoredCandidate = {
      ...candidate,
      score: totalScore,
      explanation: '',
      scores: {
        distance: distanceScore,
        interests: interestScore,
        duration: durationScore,
        reliability: reliabilityScore,
        fairness: fairnessScore,
        urgency: urgencyScore,
      },
    };

    scored.explanation = generateExplanation(scored, sharedInterests);

    return scored;
  });

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Get top candidate
  const topCandidate = scoredCandidates[0];

  // Add to seen candidates for this session
  await presenceDoc.ref.update({
    seenCandidateIds: admin.firestore.FieldValue.arrayUnion(topCandidate.uid),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Get display name
  const candidateUserDoc = await db.collection('users').doc(topCandidate.uid).get();
  const displayName = candidateUserDoc.exists
    ? candidateUserDoc.data()!.displayName
    : 'NYU Student';

  return {
    suggestion: {
      uid: topCandidate.uid,
      displayName,
      interests: topCandidate.interests,
      activity: topCandidate.activity,
      distance: topCandidate.distance,
      durationMinutes: topCandidate.durationMinutes,
      explanation: topCandidate.explanation,
      score: Math.round(topCandidate.score * 100),
    },
    searchRadiusKm: currentRadiusKm,
  };
}